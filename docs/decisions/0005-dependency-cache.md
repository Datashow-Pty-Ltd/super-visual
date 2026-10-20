# 0005: Make invalidation explicit

Status: accepted

Every selectable dataset declares the other datasets it invalidates. The
selected source may remain cached as a comparison distribution. External
filter changes invalidate every affected dataset. Returned data is committed
only when its context fingerprint matches the requested context.
