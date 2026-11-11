"""Comando idempotente per caricare le 72 domande nel database.

    python manage.py seed_questions
    python manage.py seed_questions --reset     # ricrea da zero (attenzione)

Se una domanda con lo stesso `code` esiste già viene aggiornata, non duplicata.
"""

from django.core.management.base import BaseCommand
from django.db import transaction

from game import seed_data
from game.models import Question, QuestionOption, QuestionVariant


class Command(BaseCommand):
    help = "Carica (o aggiorna) le 72 domande dell'Escape Room."

    def add_arguments(self, parser):
        parser.add_argument(
            "--reset",
            action="store_true",
            help="Elimina le domande esistenti prima di ricaricarle (le sessioni collegate restano).",
        )
        parser.add_argument(
            "--quiet",
            action="store_true",
            help="Non stampare il riepilogo domanda per domanda.",
        )

    @transaction.atomic
    def handle(self, *args, **options):
        if options["reset"]:
            deleted, _ = Question.objects.all().delete()
            self.stdout.write(self.style.WARNING(f"Rimosse {deleted} righe esistenti."))

        created = updated = 0
        options_created = 0

        for level, items in seed_data.by_level().items():
            for item in items:
                question, was_created = Question.objects.update_or_create(
                    code=item["code"],
                    defaults={
                        "level": level,
                        "title": item["title"] or seed_data.LEVEL_TITLES[level],
                        "text": item["text"],
                        "question_type": item["type"],
                        "correct_answer": item["answer"],
                        "hint": item["hint"],
                        "is_active": True,
                    },
                )
                created += int(was_created)
                updated += int(not was_created)

                # variante principale: una per domanda, con lo stesso codice
                QuestionVariant.objects.update_or_create(
                    question=question,
                    code=item["code"],
                    defaults={
                        "text": item["text"],
                        "correct_answer": item["answer"],
                        "hint": item["hint"],
                        "html_file": item.get("html_file", ""),
                        "is_active": True,
                    },
                )

                if item["type"] == Question.Type.CHOICE:
                    question.options.all().delete()
                    for position, option_text in enumerate(item["options"]):
                        QuestionOption.objects.create(
                            question=question,
                            text=option_text,
                            is_correct=option_text == item["answer"],
                            order=position,
                        )
                        options_created += 1

                if not options["quiet"]:
                    self.stdout.write(f"  · {item['code']}  {item['answer']}")

        total = Question.objects.count()
        self.stdout.write("")
        self.stdout.write(
            self.style.SUCCESS(
                f"Domande create: {created} · aggiornate: {updated} · opzioni: {options_created}"
            )
        )
        self.stdout.write(f"Totale domande in database: {total}")

        if total != 72:
            self.stdout.write(
                self.style.WARNING(
                    f"Attenzione: attese 72 domande, trovate {total}. "
                    "Usa --reset per ricaricare tutto da zero."
                )
            )
