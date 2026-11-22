# JUnit Summary

A dependency-free command-line tool that summarizes JUnit-compatible XML reports, including reports produced by `pytest --junitxml`.

## Run from this repository

```bash
python -m junit_summary path/to/junit.xml
python -m junit_summary path/to/junit.xml --format json
```

The text output includes totals for passed, failed, errored, and skipped tests, elapsed time, suite count, and names of failed/error cases. JSON output is intended for scripts and CI. A valid report exits with status `0` by default, even when it records test failures; add `--fail-on-test-failures` to return status `1` when failures or errors are present. Invalid or unreadable XML returns status `2`.

## Install the command

From this directory, install with `python -m pip install .`, then run `junit-summary path/to/junit.xml`.

## Test

```bash
python -m unittest discover -s tests -v
```

No network access or third-party runtime dependencies are required.
