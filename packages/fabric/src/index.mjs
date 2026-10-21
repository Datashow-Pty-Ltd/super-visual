export { applyDeploymentPlan, applyRestorePlan, createDeploymentDiff, createDeploymentPlan, createRestorePlan, preflightDeploymentTarget } from "./deployment.mjs";
export { bindReportToSemanticModel, connectionStringValue, decodePart, encodeDefinition, verifyDefinitionParts } from "./parts.mjs";
export { bindSemanticModelConnection, executeAcceptanceQuery, refreshSemanticModel } from "./operations.mjs";
export { discoverFabric, discoverFabricWorkspaces, readDeploymentStatus } from "./discovery.mjs";
export { checkSemanticCompatibility, inspectSemanticModel, inspectTmdlParts, semanticRequirements } from "./semantic-inspection.mjs";
