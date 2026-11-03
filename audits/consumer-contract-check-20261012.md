# Consumer cutover contract check — PR #37

Status: NO-GO production. The current Pizza Perfect Plate checkout calls create_public_order with organization_id and omits instance_id. The phase-2 candidate requires an active instance_id belonging to the same organization. This must be fixed and tested in the consumer repository before cutover. Do not merge or deploy PR #37. Production is read-only.
