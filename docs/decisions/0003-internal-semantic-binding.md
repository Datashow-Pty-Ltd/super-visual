# 0003: Keep the report-specific semantic binding internal

Status: accepted

The reusable business semantic model remains report independent. Super Visual
generates a managed binding for the exact datasets, axes, measures, filters, and
context fingerprints required by one compiled application.

This is a compiler and deployment implementation detail. The public contract is
the user's selected Power BI semantic-model ID; users never provide, discover,
name, or retain the generated resource identity.

The first public implementation uses the source-direct Import strategy that
produced the best tail latency in the AdventureWorks deployment.
