# 0004: Use a long-table widget broker

Status: accepted

Broker mode projects all report datasets through one table DataView. `WidgetId`
identifies independent result shapes. The runtime partitions rows into cached
datasets and requests invalidated widget IDs in one batch.

This decision preserves the deployed proof. Multiple simultaneous mappings did
not provide a reliable independent result-set contract for the full-page
visual.
