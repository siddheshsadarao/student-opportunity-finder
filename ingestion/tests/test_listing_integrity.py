import unittest
from datetime import date, timedelta, timezone
from unittest.mock import patch, MagicMock

from ingestion.common import parse_deadline_timestamp, job_category
from ingestion.adapters import greenhouse, ashby, devfolio, jobs
from ingestion.store import reconcile_completed_boards, fingerprint


class ListingIntegrityTests(unittest.TestCase):
    def test_distinct_employers_not_merged_for_same_job_title(self):
        self.assertNotEqual(fingerprint('Software Intern', None, 'Employer A'), fingerprint('Software Intern', None, 'Employer B'))
    def test_unknown_job_deadline_not_invented(self):
        item = greenhouse._convert({'id': 1, 'title': 'Graduate Engineer', 'absolute_url': 'https://example.org/job', 'content': 'Full role description and requirements from the employer.'}, 'Employer')
        self.assertIsNone(item.deadline)
        self.assertEqual(item.category_slug, 'job')

    def test_real_job_deadline_preserved(self):
        item = greenhouse._convert({'id': 1, 'title': 'Intern Engineer', 'absolute_url': 'https://example.org/job', 'application_deadline': {'date': '2027-01-02'}}, 'Employer')
        self.assertEqual(item.deadline, date(2027, 1, 2))
        self.assertEqual(item.category_slug, 'internship')

    def test_unlisted_ashby_role_not_public(self):
        self.assertIsNone(ashby._convert({'id': '1', 'title': 'Intern', 'isListed': False, 'jobUrl': 'https://example.org/job'}, 'Employer'))

    def test_timestamp_timezone_and_date_only(self):
        self.assertIsNone(parse_deadline_timestamp('2027-01-02'))
        self.assertIsNone(parse_deadline_timestamp('2027-01-02T18:00:00'))
        value = parse_deadline_timestamp('2027-01-02T18:00:00', timezone(timedelta(hours=5, minutes=30)))
        self.assertEqual(value.isoformat(), '2027-01-02T12:30:00+00:00')

    def test_devfolio_end_of_event_not_registration_deadline(self):
        self.assertIsNone(devfolio._convert({'uuid': '1', 'name': 'Hackathon', 'status': 'publish', 'slug': 'event', 'ends_at': '2027-01-02'}))

    def test_job_type_and_remote_feed_unknown_deadline(self):
        item = jobs._from_remotive({'id': 1, 'title': 'Junior Engineer', 'url': 'https://example.org/job', 'description': 'Full employer role description and exact requirements.'})
        self.assertEqual(item.category_slug, 'job')
        self.assertIsNone(item.deadline)
        self.assertEqual(job_category('Software Engineering Internship'), 'internship')

    def test_only_successfully_completed_boards_are_reconciled(self):
        with patch('ingestion.store.get_connection') as connection:
            self.assertEqual(reconcile_completed_boards('greenhouse', [], []), 0)
            connection.assert_not_called()
            cursor = MagicMock()
            cursor.rowcount = 2
            connection.return_value.__enter__.return_value.cursor.return_value.__enter__.return_value = cursor
            self.assertEqual(reconcile_completed_boards('greenhouse', ['complete-board'], []), 2)
            self.assertEqual(cursor.execute.call_args.args[1], ('greenhouse', 'complete-board', []))


if __name__ == '__main__':
    unittest.main()
