"""
Verifiche automatiche del progetto Django.

Esecuzione:  python manage.py test game -v 2

Coprono le regole di gioco che non possono essere verificate dal solo
JavaScript del client: timer lato server, penalità, varianti casuali,
classifica, scadenza e sicurezza delle API.
"""

from datetime import timedelta

from django.conf import settings
from django.core.management import call_command
from django.test import TestCase
from django.urls import reverse
from django.utils import timezone

from .models import (
    GameSession,
    LeaderboardEntry,
    Question,
    QuestionVariant,
    SessionQuestion,
)
from .services import format_ms, start_session


class SeedQuestionsTests(TestCase):
    def test_seed_creates_72_questions(self):
        call_command("seed_questions", "--quiet", verbosity=0)
        self.assertEqual(Question.objects.count(), 72)

    def test_seed_is_idempotent(self):
        call_command("seed_questions", "--quiet", verbosity=0)
        call_command("seed_questions", "--quiet", verbosity=0)
        self.assertEqual(Question.objects.count(), 72)
        self.assertEqual(QuestionVariant.objects.count(), 72)

    def test_nine_variants_per_level(self):
        call_command("seed_questions", "--quiet", verbosity=0)
        for level in range(1, 9):
            self.assertEqual(Question.objects.filter(level=level).count(), 9, f"livello {level}")

    def test_choice_questions_have_options(self):
        call_command("seed_questions", "--quiet", verbosity=0)
        choice_questions = Question.objects.filter(question_type=Question.Type.CHOICE)
        self.assertEqual(choice_questions.count(), 27)  # livelli 4, 5, 6
        for question in choice_questions:
            self.assertEqual(question.options.count(), 4, question.code)
            self.assertEqual(question.options.filter(is_correct=True).count(), 1, question.code)
            correct = question.options.get(is_correct=True)
            self.assertEqual(correct.text, question.correct_answer, question.code)

    def test_level2_variants_point_to_html_files(self):
        call_command("seed_questions", "--quiet", verbosity=0)
        variants = QuestionVariant.objects.filter(question__level=2)
        self.assertEqual(variants.count(), 9)
        names = set(variants.values_list("html_file", flat=True))
        self.assertEqual(len(names), 9)
        for name in names:
            self.assertTrue(name.startswith("livello_2_target_"))
            self.assertTrue(name.endswith(".html"))


class StartSessionTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        call_command("seed_questions", "--quiet", verbosity=0)

    def post_start(self, team_name="Squadra Test", mode="rapid"):
        return self.client.post(
            reverse("game:api_start"),
            data={"team_name": team_name, "mode": mode},
            content_type="application/json",
        )

    def test_start_rapid(self):
        response = self.post_start(mode="rapid")
        self.assertEqual(response.status_code, 201)
        session = response.json()["session"]
        self.assertEqual(session["mode"], "rapid")
        self.assertEqual(session["total_levels"], 5)
        self.assertEqual(session["seconds_remaining"], settings.GAME_CONFIG["rapid"]["total_seconds"])
        self.assertEqual(session["current_level"], 1)
        self.assertIsNotNone(session["question"])

    def test_start_complete(self):
        response = self.post_start(mode="complete")
        self.assertEqual(response.status_code, 201)
        session = response.json()["session"]
        self.assertEqual(session["total_levels"], 8)
        self.assertEqual(session["seconds_remaining"], settings.GAME_CONFIG["complete"]["total_seconds"])

    def test_start_rejects_empty_name(self):
        response = self.post_start(team_name="   ")
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json()["error"], "team_name_required")

    def test_start_rejects_long_name(self):
        response = self.post_start(team_name="x" * 60)
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json()["error"], "team_name_too_long")

    def test_start_rejects_invalid_mode(self):
        response = self.post_start(mode="turbo")
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json()["error"], "invalid_mode")

    def test_duplicate_active_team_name_rejected(self):
        self.post_start(team_name="Falchi")
        response = self.post_start(team_name="falchi")
        self.assertEqual(response.status_code, 409)
        self.assertEqual(response.json()["error"], "team_name_in_use")

    def test_same_name_allowed_after_completion(self):
        first = self.post_start(team_name="Falchi")
        session = GameSession.objects.get(pk=first.json()["session"]["id"])
        session.status = GameSession.Status.COMPLETED
        session.finished_at = timezone.now()
        session.save()
        response = self.post_start(team_name="Falchi")
        self.assertEqual(response.status_code, 201)

    def test_correct_answer_not_exposed(self):
        response = self.post_start()
        payload = response.json()["session"]["question"]
        answer = Question.objects.get(code=payload["code"]).correct_answer
        self.assertNotIn("correct_answer", payload)
        self.assertNotIn(answer, str(payload))


class AnswerFlowTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        call_command("seed_questions", "--quiet", verbosity=0)

    def setUp(self):
        response = self.client.post(
            reverse("game:api_start"),
            data={"team_name": "Test", "mode": "rapid"},
            content_type="application/json",
        )
        self.session_id = response.json()["session"]["id"]

    def assignment(self):
        return (
            SessionQuestion.objects.filter(session_id=self.session_id)
            .select_related("question", "variant")
            .order_by("-created_at")
            .first()
        )

    def answer(self, value):
        return self.client.post(
            reverse("game:api_answer", args=[self.session_id]),
            data={"answer": value},
            content_type="application/json",
        )

    def test_correct_answer_advances_level(self):
        current = self.assignment()
        response = self.answer(current.variant.correct_answer)
        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(payload["outcome"], "correct")
        self.assertEqual(payload["session"]["current_level"], 2)

    def test_answer_is_case_insensitive(self):
        current = self.assignment()
        response = self.answer(current.variant.correct_answer.lower())
        self.assertEqual(response.json()["outcome"], "correct")

    def test_wrong_answer_applies_penalty(self):
        before = GameSession.objects.get(pk=self.session_id).deadline
        response = self.answer("RISPOSTA_SICURAMENTE_SBAGLIATA")
        payload = response.json()
        self.assertEqual(payload["outcome"], "wrong")
        self.assertEqual(payload["session"]["error_count"], 1)
        after = GameSession.objects.get(pk=self.session_id).deadline
        self.assertEqual(
            int((before - after).total_seconds()),
            settings.GAME_CONFIG["rapid"]["penalty_seconds"],
        )

    def test_wrong_answer_keeps_level_and_new_variant(self):
        first = self.assignment()
        self.answer("SBAGLIATA")
        second = self.assignment()
        self.assertEqual(second.level, 1)
        self.assertNotEqual(first.variant_id, second.variant_id)

    def test_penalty_not_added_to_final_time(self):
        # il tempo finale dipende solo da inizio/fine
        session = GameSession.objects.get(pk=self.session_id)
        session.started_at = timezone.now() - timedelta(seconds=30)
        session.save()
        current = self.assignment()
        for level in range(1, 5):
            current = self.assignment()
            self.answer(current.variant.correct_answer)
        self.answer("SBAGLIATA")
        current = self.assignment()
        self.answer(current.variant.correct_answer)
        session.refresh_from_db()
        self.assertEqual(session.status, GameSession.Status.COMPLETED)
        # ~30 secondi di gioco, non 30 + 120 di penalità
        self.assertLess(session.elapsed_ms, 45000)

    def test_complete_mode_reaches_level_8(self):
        self.client.post(
            reverse("game:api_start"),
            data={"team_name": "Completa", "mode": "complete"},
            content_type="application/json",
        )
        session = GameSession.objects.get(team_name="Completa")
        for level in range(1, 8):
            assignment = SessionQuestion.objects.filter(session=session, level=level).last()
            response = self.client.post(
                reverse("game:api_answer", args=[session.pk]),
                data={"answer": assignment.variant.correct_answer},
                content_type="application/json",
            )
            self.assertEqual(response.json()["session"]["current_level"], level + 1)
        assignment = SessionQuestion.objects.filter(session=session, level=8).last()
        response = self.client.post(
            reverse("game:api_answer", args=[session.pk]),
            data={"answer": assignment.variant.correct_answer},
            content_type="application/json",
        )
        self.assertEqual(response.json()["outcome"], "completed")

    def test_choice_question_uses_option_id(self):
        current = self.assignment()
        for _ in range(2):
            current = self.assignment()
            self.answer(current.variant.correct_answer)
        # livello 3 è testuale, si arriva al 4 (scelta multipla) dopo un'altra risposta
        current = self.assignment()
        self.answer(current.variant.correct_answer)
        current = self.assignment()
        self.assertEqual(current.question.question_type, Question.Type.CHOICE)
        correct_option = current.question.options.get(is_correct=True)
        response = self.client.post(
            reverse("game:api_answer", args=[self.session_id]),
            data={"option_id": correct_option.pk},
            content_type="application/json",
        )
        self.assertEqual(response.json()["outcome"], "correct")

    def test_expired_session_rejects_answers(self):
        GameSession.objects.filter(pk=self.session_id).update(
            deadline=timezone.now() - timedelta(seconds=5)
        )
        current = self.assignment()
        response = self.answer(current.variant.correct_answer)
        # la sessione viene marcata scaduta alla prima richiesta utile
        self.assertEqual(response.status_code, 409)
        self.assertEqual(response.json()["error"], "session_closed")
        session = GameSession.objects.get(pk=self.session_id)
        self.assertEqual(session.status, GameSession.Status.EXPIRED)
        self.assertFalse(LeaderboardEntry.objects.filter(session=session).exists())

    def test_penalty_that_exhausts_time_expires_session(self):
        # deadline molto vicina: la penalità porta il timer sotto zero
        GameSession.objects.filter(pk=self.session_id).update(
            deadline=timezone.now() + timedelta(seconds=30)
        )
        current = self.assignment()
        response = self.answer("SBAGLIATA")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["outcome"], "expired")
        self.assertEqual(
            GameSession.objects.get(pk=self.session_id).status, GameSession.Status.EXPIRED
        )
        self.assertFalse(LeaderboardEntry.objects.filter(session_id=self.session_id).exists())

    def test_unknown_session_404(self):
        response = self.client.get(
            reverse("game:api_state", args=["00000000-0000-0000-0000-000000000000"])
        )
        self.assertEqual(response.status_code, 404)

    def test_answers_after_completion_rejected(self):
        session = GameSession.objects.get(pk=self.session_id)
        session.status = GameSession.Status.COMPLETED
        session.save()
        response = self.answer("X")
        self.assertEqual(response.status_code, 409)


class LeaderboardTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        call_command("seed_questions", "--quiet", verbosity=0)

    def complete_session(self, team_name, elapsed_seconds, mode="rapid"):
        """Crea una sessione già completata con un tempo controllato."""
        now = timezone.now()
        session = GameSession.objects.create(
            team_name=team_name,
            mode=mode,
            current_level=settings.GAME_CONFIG[mode]["levels"],
            started_at=now - timedelta(seconds=elapsed_seconds),
            finished_at=now,
            deadline=now + timedelta(minutes=1),
            status=GameSession.Status.COMPLETED,
        )
        LeaderboardEntry.objects.create(
            session=session,
            mode=mode,
            team_name=team_name,
            elapsed_ms=elapsed_seconds * 1000,
            completed_at=now,
        )
        return session

    def test_only_completed_sessions_enter_leaderboard(self):
        GameSession.objects.create(
            team_name="Abbandonata",
            mode="rapid",
            deadline=timezone.now() + timedelta(minutes=5),
            status=GameSession.Status.ABANDONED,
        )
        self.assertEqual(LeaderboardEntry.objects.count(), 0)

    def test_top_three_ordering(self):
        self.complete_session("Lenta", 300)
        self.complete_session("Veloce", 120)
        self.complete_session("Media", 200)
        self.complete_session("Fuori", 400)
        response = self.client.get(reverse("game:api_leaderboard"))
        rapid = response.json()["leaderboard"]["rapid"]
        self.assertEqual(len(rapid), 3)
        self.assertEqual([entry["team_name"] for entry in rapid], ["Veloce", "Media", "Lenta"])

    def test_tie_keeps_first_registered(self):
        now = timezone.now()
        first = GameSession.objects.create(
            team_name="Prima", mode="rapid", started_at=now - timedelta(seconds=100),
            finished_at=now, deadline=now, status=GameSession.Status.COMPLETED,
        )
        LeaderboardEntry.objects.create(
            session=first, mode="rapid", team_name="Prima", elapsed_ms=100000,
            completed_at=now - timedelta(minutes=5),
        )
        second = GameSession.objects.create(
            team_name="Seconda", mode="rapid", started_at=now - timedelta(seconds=100),
            finished_at=now, deadline=now, status=GameSession.Status.COMPLETED,
        )
        LeaderboardEntry.objects.create(
            session=second, mode="rapid", team_name="Seconda", elapsed_ms=100000,
            completed_at=now,
        )
        top = list(LeaderboardEntry.top("rapid"))
        self.assertEqual(top[0].team_name, "Prima")

    def test_modes_are_separate(self):
        self.complete_session("Rapida", 100, mode="rapid")
        self.complete_session("Completa", 200, mode="complete")
        response = self.client.get(reverse("game:api_leaderboard"))
        data = response.json()["leaderboard"]
        self.assertEqual(len(data["rapid"]), 1)
        self.assertEqual(len(data["complete"]), 1)
        self.assertEqual(data["rapid"][0]["team_name"], "Rapida")

    def test_format_ms(self):
        self.assertEqual(format_ms(65432), "01:05.43")
        self.assertEqual(format_ms(1000), "00:01.00")
        self.assertEqual(format_ms(0), "00:00.00")


class PageTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        call_command("seed_questions", "--quiet", verbosity=0)

    def test_home_page(self):
        response = self.client.get(reverse("game:index"))
        self.assertEqual(response.status_code, 200)
        self.assertContains(response, "Inserimento registro agenti")
        self.assertContains(response, "Rapida")
        self.assertContains(response, "Completa")

    def test_home_shows_real_times_and_penalties(self):
        response = self.client.get(reverse("game:index"))
        self.assertContains(response, "12 minuti")
        self.assertContains(response, "17 minuti")
        self.assertContains(response, "−2:00")
        self.assertContains(response, "−2:30")
        # nessun valore vuoto lasciato dai filtri dei template
        self.assertNotContains(response, "<strong> minuti</strong>")
        self.assertNotContains(response, "<strong>−</strong>")

    def test_home_contains_csrf_cookie(self):
        response = self.client.get(reverse("game:index"))
        self.assertIn("csrftoken", response.cookies)

    def test_leaderboard_page(self):
        response = self.client.get(reverse("game:leaderboard"))
        self.assertEqual(response.status_code, 200)
        self.assertContains(response, "Classifiche ufficiali")

    def test_play_and_result_pages(self):
        session = start_session("Pagina", "rapid")
        response = self.client.get(reverse("game:play", args=[session.pk]))
        self.assertEqual(response.status_code, 200)
        self.assertContains(response, "initial-state")

        session.status = GameSession.Status.COMPLETED
        session.finished_at = timezone.now()
        session.save()
        response = self.client.get(reverse("game:result", args=[session.pk]))
        self.assertEqual(response.status_code, 200)
        self.assertContains(response, "Badge ufficiale hacker")

    def test_result_page_for_expired_session(self):
        session = start_session("Scaduta", "rapid")
        session.status = GameSession.Status.EXPIRED
        session.save()
        response = self.client.get(reverse("game:result", args=[session.pk]))
        self.assertContains(response, "System lockdown")

    def test_health_endpoint(self):
        response = self.client.get(reverse("game:api_health"))
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["questions"], 72)

    def test_admin_requires_login(self):
        response = self.client.get("/admin/")
        self.assertEqual(response.status_code, 302)

    def test_csrf_enforced_on_post(self):
        client = self.client_class(enforce_csrf_checks=True)
        response = client.post(
            reverse("game:api_start"),
            data={"team_name": "Senza token", "mode": "rapid"},
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 403)

    def test_penalty_and_times_not_editable_in_admin(self):
        from django.contrib import admin

        from .models import GameSession as Session

        session_admin = admin.site._registry[Session]
        self.assertNotIn("total_seconds", session_admin.get_fields(None) or [])
        self.assertNotIn("penalty_seconds", session_admin.get_fields(None) or [])
