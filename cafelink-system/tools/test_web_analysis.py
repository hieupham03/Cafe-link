import unittest
from analyze_web import percentile, validate


class MeasurementChecks(unittest.TestCase):
    def test_nearest_rank_and_missing_samples(self):
        self.assertEqual(percentile([40, 10, 30, 20], .5), 20)
        self.assertEqual(percentile(list(range(1, 101)), .95), 95)
        self.assertIsNone(percentile([], .95))

    def test_invalid_timing_is_not_silently_filtered(self):
        for sample in [float('nan'), float('inf'), -1]:
            with self.assertRaises(ValueError):
                percentile([sample], .95)

    def test_failure_or_incomplete_run_cannot_become_pass(self):
        good = {'status': 'PASS', 'failed': 0, 'completedCases': 1}
        validate(good, [{'status': 'PASS'}], 1)
        for metadata, rows, count in [(good, [{'status': 'FAIL'}], 1), (good, [], 1), (good, [{'status': 'PASS'}], 2), ({**good, 'failed': 1}, [{'status': 'PASS'}], 1)]:
            with self.assertRaises(ValueError):
                validate(metadata, rows, count)


if __name__ == '__main__':
    unittest.main()
