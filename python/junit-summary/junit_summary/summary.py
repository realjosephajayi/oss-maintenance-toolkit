"""Summarize JUnit-compatible test reports without third-party dependencies."""

from __future__ import annotations

import argparse
import json
import sys
import xml.etree.ElementTree as ET
from dataclasses import asdict, dataclass, field
from decimal import Decimal, InvalidOperation
from pathlib import Path
from typing import Any


@dataclass
class Failure:
    suite: str
    classname: str
    test: str
    kind: str
    message: str
    details: str


@dataclass
class SuiteSummary:
    name: str
    tests: int = 0
    failures: int = 0
    errors: int = 0
    skipped: int = 0
    duration_seconds: float = 0.0


@dataclass
class ReportSummary:
    source: str
    suites: int = 0
    tests: int = 0
    failures: int = 0
    errors: int = 0
    skipped: int = 0
    duration_seconds: float = 0.0
    suite_details: list[SuiteSummary] = field(default_factory=list)
    failure_details: list[Failure] = field(default_factory=list)

    @property
    def passed(self) -> int:
        return max(0, self.tests - self.failures - self.errors - self.skipped)

    def to_dict(self) -> dict[str, Any]:
        result = asdict(self)
        result["passed"] = self.passed
        return result


def _seconds(value: str | None) -> Decimal:
    if value is None:
        return Decimal(0)
    try:
        number = Decimal(value)
    except InvalidOperation:
        return Decimal(0)
    return number if number.is_finite() and number >= 0 else Decimal(0)


def _text(element: ET.Element | None) -> str:
    if element is None:
        return ""
    return "".join(element.itertext()).strip()


def parse_report(report_path: str | Path) -> ReportSummary:
    """Parse a JUnit XML report and return test counts and failure details."""
    path = Path(report_path)
    try:
        root = ET.parse(path).getroot()
    except (ET.ParseError, OSError) as exc:
        raise ValueError(f"cannot read JUnit XML report {path}: {exc}") from exc

    suites = [root] if root.tag == "testsuite" else list(root.iter("testsuite"))
    summary = ReportSummary(source=str(path), suites=len(suites))
    found_cases = False

    for suite in suites:
        detail = SuiteSummary(name=suite.get("name", "unnamed suite"))
        suite_duration_from_cases = Decimal(0)
        suite_cases = suite.findall("testcase")
        for case in suite_cases:
            found_cases = True
            detail.tests += 1
            suite_duration_from_cases += _seconds(case.get("time"))
            failure = case.find("failure")
            error = case.find("error")
            skipped = case.find("skipped")
            case_name = case.get("name", "unnamed test")
            classname = case.get("classname", "")

            if failure is not None:
                detail.failures += 1
                summary.failure_details.append(
                    Failure(detail.name, classname, case_name, "failure", failure.get("message", ""), _text(failure))
                )
            elif error is not None:
                detail.errors += 1
                summary.failure_details.append(
                    Failure(detail.name, classname, case_name, "error", error.get("message", ""), _text(error))
                )
            elif skipped is not None:
                detail.skipped += 1

        if suite_cases:
            detail.duration_seconds = float(suite_duration_from_cases)
        else:
            # Some producers report suite totals without emitting individual testcases.
            detail.tests = int(suite.get("tests", "0") or 0)
            detail.failures = int(suite.get("failures", "0") or 0)
            detail.errors = int(suite.get("errors", "0") or 0)
            detail.skipped = int(suite.get("skipped", suite.get("disabled", "0")) or 0)
            detail.duration_seconds = float(_seconds(suite.get("time")))

        summary.tests += detail.tests
        summary.failures += detail.failures
        summary.errors += detail.errors
        summary.skipped += detail.skipped
        summary.duration_seconds += detail.duration_seconds
        summary.suite_details.append(detail)

    if not suites:
        # Permit a minimal report with a bare <testsuites> element and aggregate attributes.
        summary.tests = int(root.get("tests", "0") or 0)
        summary.failures = int(root.get("failures", "0") or 0)
        summary.errors = int(root.get("errors", "0") or 0)
        summary.skipped = int(root.get("skipped", root.get("disabled", "0")) or 0)
        summary.duration_seconds = float(_seconds(root.get("time")))

    # Avoid an unused flag while documenting that testcase data takes precedence over totals.
    _ = found_cases
    return summary


def render_text(summary: ReportSummary) -> str:
    duration = f"{summary.duration_seconds:.2f}s"
    line = (
        f"{summary.tests} tests: {summary.passed} passed, {summary.failures} failed, "
        f"{summary.errors} errors, {summary.skipped} skipped ({duration}; {summary.suites} suites)"
    )
    if not summary.failure_details:
        return line

    lines = [line, "", "Failure details:"]
    for item in summary.failure_details:
        location = f"{item.classname}.{item.test}" if item.classname else item.test
        message = item.message or item.details.splitlines()[0] if item.details else item.message
        lines.append(f"- [{item.kind}] {item.suite}: {location}" + (f" — {message}" if message else ""))
    return "\n".join(lines)


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="junit-summary",
        description="Summarize a JUnit XML test report as readable text or JSON.",
    )
    parser.add_argument("report", type=Path, help="path to a JUnit XML report (pytest --junitxml is supported)")
    parser.add_argument("--format", choices=("text", "json"), default="text", help="output format (default: text)")
    parser.add_argument("--fail-on-test-failures", action="store_true", help="exit with status 1 if the report includes failures or errors")
    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    try:
        summary = parse_report(args.report)
    except ValueError as exc:
        print(f"junit-summary: {exc}", file=sys.stderr)
        return 2

    if args.format == "json":
        print(json.dumps(summary.to_dict(), indent=2, ensure_ascii=False))
    else:
        print(render_text(summary))
    if args.fail_on_test_failures and (summary.failures or summary.errors):
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
