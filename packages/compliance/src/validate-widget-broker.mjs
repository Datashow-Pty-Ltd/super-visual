function parseColumnReference(reference) {
  if (typeof reference !== "string" || !reference.endsWith("]")) return null;
  const separator = reference.lastIndexOf("[", reference.length - 2);
  if (separator <= 0 || separator === reference.length - 2) return null;
  return { table: reference.slice(0, separator), column: reference.slice(separator + 1, -1) };
}

function columnExists(semanticModel, reference) {
  const parsed = parseColumnReference(reference);
  if (!parsed) return false;
  const table = semanticModel.tables?.find((candidate) => candidate.name === parsed.table);
  return Boolean(table?.columns?.some((column) => column.name === parsed.column));
}

function measureExists(semanticModel, reference) {
  if (typeof reference !== "string") return false;
  const qualified = parseColumnReference(reference);
  if (qualified) {
    const table = semanticModel.tables?.find((candidate) => candidate.name === qualified.table);
    return Boolean(table?.measures?.some((measure) => measure.name === qualified.column));
  }
  const unqualified = reference.startsWith("[") && reference.endsWith("]") && reference.indexOf("[", 1) === -1
    ? reference.slice(1, -1)
    : null;
  if (!unqualified) return false;
  return semanticModel.tables?.flatMap((table) => table.measures ?? [])
    .filter((measure) => measure.name === unqualified).length === 1;
}

function declaredHierarchyMatches(semanticModel, dimensions) {
  const parsed = dimensions.map((dimension) => parseColumnReference(dimension.label));
  if (parsed.some((item) => !item)) return false;
  const tableNames = new Set(parsed.map((item) => item.table));
  if (tableNames.size !== 1) return false;
  const table = semanticModel.tables?.find((candidate) => candidate.name === parsed[0].table);
  const columns = parsed.map((item) => item.column);
  return Boolean(table?.hierarchies?.some((hierarchy) => {
    const hierarchyColumns = hierarchy.levels?.map((level) => level.column) ?? [];
    return hierarchyColumns.length === columns.length && hierarchyColumns.every((column, index) => column === columns[index]);
  }));
}

function declaredHierarchyPrefixMatches(semanticModel, dimensions) {
  const parsed = dimensions.map((dimension) => parseColumnReference(dimension.label));
  if (parsed.some((item) => !item)) return false;
  const tableNames = new Set(parsed.map((item) => item.table));
  if (tableNames.size !== 1) return false;
  const table = semanticModel.tables?.find((candidate) => candidate.name === parsed[0].table);
  const columns = parsed.map((item) => item.column);
  return Boolean(table?.hierarchies?.some((hierarchy) => {
    const hierarchyColumns = hierarchy.levels?.map((level) => level.column) ?? [];
    return hierarchyColumns.length >= columns.length && columns.every((column, index) => hierarchyColumns[index] === column);
  }));
}

function dimensionsShareTable(dimensions) {
  const parsed = dimensions.map((dimension) => parseColumnReference(dimension.label));
  return parsed.every(Boolean) && new Set(parsed.map((item) => item.table)).size === 1;
}

export function validateWidgetBrokerContract(broker, semanticModel) {
  const errors = [];
  const widgets = Array.isArray(broker?.widgets) ? broker.widgets : [];
  const byId = new Map(widgets.map((widget) => [widget.id, widget]));
  if (widgets.length === 0) errors.push("at least one broker dataset is required");
  if (byId.size !== widgets.length) errors.push("widget ids must be unique");
  const fields = broker?.dataView?.fields ?? [];
  const requiredFields = ["WidgetId", "AxisKey", "Label", "Sort", "SeriesKey", "SeriesLabel", "WidgetValue", "BrokerContext"];
  if (fields.length !== requiredFields.length || !requiredFields.every((field) => fields.includes(field)) || new Set(fields).size !== fields.length) {
    errors.push("broker data view must declare each required field exactly once");
  }

  for (const widget of widgets) {
    const id = widget.id ?? "(unnamed)";
    const dimensions = Array.isArray(widget.dimensions) ? widget.dimensions : [];
    if (widget.shape === "categorical" && dimensions.length !== 1) errors.push(`${id} categorical rows require exactly one governed dimension`);
    if (widget.shape === "series" && (dimensions.length < 1 || dimensions.length > 3)) errors.push(`${id} series rows require one to three ordered governed dimensions`);
    if (widget.shape === "series" && ["top-by-value", "bottom-by-value"].includes(widget.rowSelection)) errors.push(`${id} series rows must preserve axis order; value-ranked selection is not valid for a trend`);
    if (widget.shape === "hierarchy" && dimensions.length < 2) errors.push(`${id} hierarchy rows require at least two governed dimensions`);
    if (widget.shape === "flow" && dimensions.length !== 2) errors.push(`${id} flow rows require exactly two governed dimensions`);
    const keyReferences = dimensions.map((dimension) => dimension?.key);
    const labelReferences = dimensions.map((dimension) => dimension?.label);
    if (new Set(keyReferences).size !== dimensions.length || new Set(labelReferences).size !== dimensions.length) errors.push(`${id} contains duplicate dimensions and would create a self-referential graph path`);
    if (dimensions.at(-1)?.label !== widget.axis) errors.push(`${id}.axis must equal its final readable label so selection and display use the same semantic field`);
    for (const dimension of dimensions) {
      if (!columnExists(semanticModel, dimension?.key)) errors.push(`${id} has unresolved dimension key ${dimension?.key}`);
      if (!columnExists(semanticModel, dimension?.label)) errors.push(`${id} has unresolved dimension label ${dimension?.label}`);
    }
    if (widget.shape === "hierarchy" && !declaredHierarchyPrefixMatches(semanticModel, dimensions)) {
      errors.push(`${id} dimensions must match a leading prefix of one declared semantic-model hierarchy in level order`);
    }
    if (widget.shape === "series" && dimensions.length > 1 && !dimensionsShareTable(dimensions)) {
      errors.push(`${id} series sort and display dimensions must come from one semantic table`);
    }
    if (widget.shape === "flow" && dimensions.length === 2) {
      const [source, target] = dimensions;
      if (source?.key === target?.key || source?.label === target?.label) errors.push(`${id} flow source and target must be distinct semantic fields`);
    }
    const measures = Array.isArray(widget.measures) ? widget.measures : [];
    if (measures.length === 0) errors.push(`${id} requires at least one measure`);
    if (new Set(measures).size !== measures.length) errors.push(`${id} contains duplicate measures`);
    for (const measure of measures) {
      if (!measureExists(semanticModel, measure)) errors.push(`${id} has unresolved measure ${measure}`);
    }
    const invalidates = Array.isArray(widget.invalidates) ? widget.invalidates : [];
    for (const target of invalidates) {
      if (!byId.has(target)) errors.push(`${id} invalidates unknown widget ${target}`);
      if (target === id) errors.push(`${id} must not invalidate itself`);
    }
    if (!widget.selectable && invalidates.length) errors.push(`${id} is not selectable and must not declare invalidation targets`);
  }

  return errors;
}

const COMPONENT_SHAPES = {
  tree: "hierarchy",
  sankey: "flow",
};

export function validateReportGraphBindings(pageSet, broker) {
  const errors = [];
  const widgets = new Map((broker?.widgets ?? []).map((widget) => [widget.id, widget]));
  const pages = pageSet?.pages ?? (pageSet?.routes ?? []).map((route) => ({ ...route, widgets: route.sections ?? [] }));
  for (const page of pages) {
    for (const widget of page.widgets ?? []) {
      const primitive = widget.primitive ?? (widget.component === "treegraph" ? "tree" : widget.component);
      const expectedShape = COMPONENT_SHAPES[primitive];
      const actualShape = widgets.get(widget.dataset)?.shape;
      const lineDataset = widgets.get(widget.dataset);
      const measureCount = lineDataset?.measures?.length ?? 0;
      const orderedLineShape = actualShape === "series"
        || (actualShape === "categorical" && ["first-by-axis", "last-by-axis"].includes(lineDataset?.rowSelection));
      if (primitive === "line" && !orderedLineShape) {
        errors.push(`${page.id}.${widget.id} uses line but dataset ${widget.dataset} is not axis-ordered; series or ordered categorical rows are required`);
      }
      if (["pie", "sankey", "tree"].includes(primitive) && measureCount !== 1) {
        errors.push(`${page.id}.${widget.id} uses ${primitive} but dataset ${widget.dataset} has ${measureCount} measures; exactly one measure is required`);
      }
      if (!expectedShape) continue;
      if (actualShape !== expectedShape) {
        errors.push(`${page.id}.${widget.id} uses ${primitive} but dataset ${widget.dataset} is ${actualShape ?? "missing"}; ${expectedShape} rows are required`);
      }
    }
  }
  for (const page of pages) {
    for (const kpi of page.kpis ?? []) {
      const dataset = widgets.get(kpi.binding?.dataset);
      const measureCount = dataset?.measures?.length ?? 0;
      if (measureCount !== 1) errors.push(`${page.id}.${kpi.id} is a KPI bound to ${kpi.binding?.dataset} with ${measureCount} measures; exactly one measure is required`);
    }
    const emphasisDataset = widgets.get(page.summary?.emphasisBinding?.dataset);
    if (page.summary?.emphasisBinding && (emphasisDataset?.measures?.length ?? 0) !== 1) {
      errors.push(`${page.id} summary emphasis must bind to a single-measure dataset`);
    }
  }
  return errors;
}

function filterContextErrors(context, semanticModel, prefix) {
  const errors = [];
  const entries = Array.isArray(context) ? context : [];
  const targets = entries.map((entry) => entry?.target);
  if (new Set(targets).size !== targets.length) errors.push(`${prefix} filter targets must be unique`);
  for (const entry of entries) {
    const target = entry?.target ?? "(missing)";
    if (!columnExists(semanticModel, target)) errors.push(`${prefix} has unresolved filter target ${target}`);
    if (entry?.required && (entry.defaultValue === null || entry.defaultValue === undefined || entry.defaultValue === "")) {
      errors.push(`${prefix} required filter ${target} must declare a non-empty defaultValue`);
    }
  }
  return errors;
}

export function validateReportPlanFilterContext(reportPlan, semanticModel) {
  const errors = filterContextErrors(reportPlan?.filterContext, semanticModel, "report plan");
  const businessQuestions = Array.isArray(reportPlan?.businessQuestions) ? reportPlan.businessQuestions : [];
  const questionIds = businessQuestions.map((question) => question?.id);
  const declaredQuestionIds = new Set(questionIds);
  const usedQuestionIds = new Set();
  if (businessQuestions.length === 0) errors.push("report plan requires at least one business-health question");
  if (declaredQuestionIds.size !== questionIds.length) errors.push("report plan business-question ids must be unique");
  const widgetIds = [];
  for (const page of reportPlan?.pages ?? []) {
    for (const widget of page.widgets ?? []) {
      const id = widget.id ?? "(unnamed)";
      widgetIds.push(id);
      const widgetQuestionIds = Array.isArray(widget.businessQuestionIds) ? widget.businessQuestionIds : [];
      if (widgetQuestionIds.length === 0) errors.push(`report plan widget ${id} must answer at least one business-health question`);
      if (new Set(widgetQuestionIds).size !== widgetQuestionIds.length) errors.push(`report plan widget ${id} contains duplicate business-question references`);
      for (const questionId of widgetQuestionIds) {
        if (!declaredQuestionIds.has(questionId)) errors.push(`report plan widget ${id} references unknown business question ${questionId}`);
        else usedQuestionIds.add(questionId);
      }
      for (const dimension of widget.dimensions ?? []) {
        if (!columnExists(semanticModel, dimension)) errors.push(`report plan widget ${id} has unresolved dimension ${dimension}`);
      }
      for (const measure of widget.measures ?? []) {
        if (!measureExists(semanticModel, measure)) errors.push(`report plan widget ${id} has unresolved measure ${measure}`);
      }
    }
  }
  if (new Set(widgetIds).size !== widgetIds.length) errors.push("report plan widget ids must be unique across pages");
  for (const questionId of declaredQuestionIds) {
    if (!usedQuestionIds.has(questionId)) errors.push(`report plan business question ${questionId} is not answered by any widget`);
  }
  const globalFilters = Array.isArray(reportPlan?.globalFilters) ? reportPlan.globalFilters : [];
  const contextTargets = new Set((reportPlan?.filterContext ?? []).map((entry) => entry.target));
  if (new Set(globalFilters).size !== globalFilters.length) errors.push("report plan global filters must be unique");
  for (const target of globalFilters) {
    if (!columnExists(semanticModel, target)) errors.push(`report plan has unresolved global filter ${target}`);
    if (!contextTargets.has(target)) errors.push(`report plan global filter ${target} is missing an executable filterContext contract`);
  }
  for (const target of contextTargets) {
    if (!globalFilters.includes(target)) errors.push(`report plan filterContext target ${target} is not declared in globalFilters`);
  }
  return errors;
}

export function validateReportApplicationFilterContext(pageSet, semanticModel) {
  return filterContextErrors(pageSet?.shell?.filterContext ?? pageSet?.application?.filterContext, semanticModel, "page set");
}

function sameMembers(left, right) {
  return left.length === right.length && left.every((value) => right.includes(value));
}

export function validateReportQuestionHandoff(reportPlan, broker, pageSet) {
  const errors = [];
  const questions = Array.isArray(reportPlan?.businessQuestions) ? reportPlan.businessQuestions : [];
  const questionIds = new Set(questions.map((question) => question?.id));
  const plannedWidgets = (reportPlan?.pages ?? []).flatMap((page) => page.widgets ?? []);
  const plannedById = new Map(plannedWidgets.map((widget) => [widget.id, widget]));
  const mappedPlanWidgets = new Map();

  for (const dataset of broker?.widgets ?? []) {
    const datasetId = dataset.id ?? "(unnamed)";
    const reportWidgetIds = Array.isArray(dataset.reportWidgetIds) ? dataset.reportWidgetIds : [];
    const businessQuestionIds = Array.isArray(dataset.businessQuestionIds) ? dataset.businessQuestionIds : [];
    if (reportWidgetIds.length === 0) errors.push(`broker dataset ${datasetId} must preserve at least one report-plan widget id`);
    if (businessQuestionIds.length === 0) errors.push(`broker dataset ${datasetId} must preserve at least one business-question id`);
    if (new Set(reportWidgetIds).size !== reportWidgetIds.length) errors.push(`broker dataset ${datasetId} contains duplicate report-plan widget ids`);
    if (new Set(businessQuestionIds).size !== businessQuestionIds.length) errors.push(`broker dataset ${datasetId} contains duplicate business-question ids`);

    const expectedQuestionIds = new Set();
    for (const reportWidgetId of reportWidgetIds) {
      const plannedWidget = plannedById.get(reportWidgetId);
      if (!plannedWidget) {
        errors.push(`broker dataset ${datasetId} references unknown report-plan widget ${reportWidgetId}`);
        continue;
      }
      const mappedBy = mappedPlanWidgets.get(reportWidgetId);
      if (mappedBy) errors.push(`report-plan widget ${reportWidgetId} is mapped by more than one broker dataset (${mappedBy}, ${datasetId})`);
      else mappedPlanWidgets.set(reportWidgetId, datasetId);
      for (const questionId of plannedWidget.businessQuestionIds ?? []) expectedQuestionIds.add(questionId);
    }
    for (const questionId of businessQuestionIds) {
      if (!questionIds.has(questionId)) errors.push(`broker dataset ${datasetId} references unknown business question ${questionId}`);
    }
    const expected = [...expectedQuestionIds];
    if (!sameMembers(businessQuestionIds, expected)) {
      errors.push(`broker dataset ${datasetId} businessQuestionIds must exactly preserve the questions from its reportWidgetIds`);
    }
  }

  for (const plannedWidget of plannedWidgets) {
    if (!mappedPlanWidgets.has(plannedWidget.id)) errors.push(`report-plan widget ${plannedWidget.id} was dropped before the broker contract`);
  }

  if (!pageSet) return errors;
  const brokerById = new Map((broker?.widgets ?? []).map((dataset) => [dataset.id, dataset]));
  const implementedWidgetIds = new Set();
  const implementedQuestionIds = new Set();
  for (const page of pageSet.pages ?? []) {
    const analyticalItems = [
      ...(page.widgets ?? []).map((widget) => ({ ...widget, datasetId: widget.dataset, kind: "widget" })),
      ...(page.kpis ?? []).map((kpi) => ({ ...kpi, datasetId: kpi.binding?.dataset, kind: "KPI" })),
    ];
    for (const item of analyticalItems) {
      const label = `${page.id}.${item.id}`;
      const dataset = brokerById.get(item.datasetId);
      if (!dataset) {
        errors.push(`${label} references missing broker dataset ${item.datasetId}`);
        continue;
      }
      const reportWidgetIds = Array.isArray(item.reportWidgetIds) ? item.reportWidgetIds : [];
      const businessQuestionIds = Array.isArray(item.businessQuestionIds) ? item.businessQuestionIds : [];
      if (!sameMembers(reportWidgetIds, dataset.reportWidgetIds ?? [])) {
        errors.push(`${label} reportWidgetIds must exactly preserve broker dataset ${item.datasetId}`);
      }
      if (!sameMembers(businessQuestionIds, dataset.businessQuestionIds ?? [])) {
        errors.push(`${label} businessQuestionIds must exactly preserve broker dataset ${item.datasetId}`);
      }
      for (const reportWidgetId of reportWidgetIds) implementedWidgetIds.add(reportWidgetId);
      for (const questionId of businessQuestionIds) implementedQuestionIds.add(questionId);
    }
  }
  for (const plannedWidget of plannedWidgets) {
    if (!implementedWidgetIds.has(plannedWidget.id)) errors.push(`report-plan widget ${plannedWidget.id} was not implemented by any page-set widget or KPI`);
  }
  for (const questionId of questionIds) {
    if (!implementedQuestionIds.has(questionId)) errors.push(`business question ${questionId} was not implemented by the page set`);
  }
  return errors;
}

export function validateReportFilterHandoff(reportPlan, pageSet, semanticModel) {
  const errors = [
    ...validateReportPlanFilterContext(reportPlan, semanticModel),
    ...validateReportApplicationFilterContext(pageSet, semanticModel),
  ];
  const planned = reportPlan?.filterContext ?? [];
  const implemented = pageSet?.shell?.filterContext ?? pageSet?.application?.filterContext ?? [];
  if (JSON.stringify(implemented) !== JSON.stringify(planned)) {
    errors.push("page-set shell.filterContext must preserve the accepted report-plan contract exactly");
  }
  return errors;
}
