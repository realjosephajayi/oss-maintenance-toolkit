import json
import tempfile
import unittest
from pathlib import Path

from junit_summary.summary import main, parse_report, render_text


SAMPLE_REPORT = """<?xml version="1.0"?>
<testsuites tests="4" failures="1" errors="1" skipped="1" time="1.75">
  <testsuite name="unit" tests="3" failures="1" errors="0" skipped="1">
    <testcase classname="math" name="test_add" time="0.25" />
    <testcase classname="math" name="test_subtract" time="0.50">
      <failure message="expected 2">AssertionError: expected 2</failure>
    </testcase>
    <testcase classname="math" name="test_divide" time="0.10"><skipped message="not supported" /></testcase>
  </testsuite>
  <testsuite name="integration" tests="1" failures="0" errors="1" skipped="0">
    <testcase classname="api" name="test_connection" time="0.90">
      <error message="connection refused">ConnectionError: refused</error>
    </testcase>
  </testsuite>
</testsuites>
"""


class SummaryTests(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.report_path = Path(self.temp_dir.name) / "junit.xml"
        self.report_path.write_text(SAMPLE_REPORT, encoding="utf-8")

    def tearDown(self):
        self.temp_dir.cleanup()

    def test_counts_nested_suites_and_case_outcomes(self):
        summary = parse_report(self.report_path)
        self.assertEqual((summary.tests, summary.passed, summary.failures, summary.errors, summary.skipped), (4, 1, 1, 1, 1))
        self.assertEqual(summary.suites, 2)
        self.assertAlmostEqual(summary.duration_seconds, 1.75)
        self.assertEqual([failure.kind for failure in summary.failure_details], ["failure", "error"])

    def test_text_report_includes_totals_and_failure_names(self):
        rendered = render_text(parse_report(self.report_path))
        self.assertIn("4 tests: 1 passed, 1 failed, 1 errors, 1 skipped", rendered)
        self.assertIn("math.test_subtract", rendered)
        self.assertIn("api.test_connection", rendered)

    def test_json_mode_contains_derived_passed_count(self):
        from io import StringIO
        from contextlib import redirect_stdout

        output = StringIO()
        with redirect_stdout(output):
            result = main([str(self.report_path), "--format", "json"])
        self.assertEqual(result, 0)
        self.assertEqual(json.loads(output.getvalue())["passed"], 1)

    def test_failure_exit_flag_is_opt_in(self):
        self.assertEqual(main([str(self.report_path)]), 0)
        self.assertEqual(main([str(self.report_path), "--fail-on-test-failures"]), 1)

    def test_malformed_xml_raises_clear_error(self):
        bad = Path(self.temp_dir.name) / "bad.xml"
        bad.write_text("<testsuites>", encoding="utf-8")
        with self.assertRaisesRegex(ValueError, "cannot read JUnit XML report"):
            parse_report(bad)

    def test_missing_report_returns_usage_error(self):
        self.assertEqual(main([str(Path(self.temp_dir.name) / "missing.xml")]), 2)


if __name__ == "__main__":
    unittest.main()
