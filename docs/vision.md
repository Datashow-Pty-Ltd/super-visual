# Vision

Super Visual is a compiler and deployment toolchain for analytical React
applications that run as full-page Power BI custom visuals.

Its public contract is a project containing React source, local assets,
semantic dataset bindings, interaction dependencies, visual metadata, and a
deployment environment. A build produces a `.pbiviz`, an internally managed
semantic binding, a PBIR report, and machine-readable compliance, provenance,
and deployment manifests.

## Product principles

1. React applications are compiled into the visual package. The runtime does
   not download or execute application code.
2. Presentation components have no direct dependency on Power BI host APIs.
3. All displayed data comes from declared semantic-model bindings.
4. The Power BI semantic model selected by the user is not changed for an
   individual report.
5. Report-specific projections are internal compiler and deployment artifacts;
   users provide only the selected semantic-model ID.
6. The compiler validates model references, interaction dependencies, source
   policy, packaging, and report bindings before deployment.
7. Deployments begin with a read-only plan and default to preserving existing
   Fabric items.
8. People and agents use the same CLI and JSON result contracts.

## First release

Version `0.1.0` targets React and Power BI. It supports the long-table broker
and internally managed source-direct projection proven by the AdventureWorks deployment. The
architecture permits additional semantic and report targets, but they are not
part of the first release contract.
