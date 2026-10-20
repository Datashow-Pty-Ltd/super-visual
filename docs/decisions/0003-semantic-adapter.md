# 0003: Generate a report-specific semantic adapter

Status: accepted

The reusable business semantic model remains report independent. Super Visual
generates an adapter model for the exact datasets, axes, measures, filters, and
context fingerprints required by one compiled application.

The first public implementation uses the source-direct Import adapter that
produced the best tail latency in the AdventureWorks deployment.
