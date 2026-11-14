// Called inside the same transaction as the UPSERT and inbox receipt.
// Users are global identities: their credential/profile changes must reach
// devices linked to every company in which the user has a membership.
async function publishSyncChange(client, { changeId, companyId, entity, entityId, operation, payload, deviceId }) {
  const companies = new Set([companyId]);
  if (entity === 'usuarios') {
    const memberships = await client.query('SELECT DISTINCT empresa_id FROM usuario_empresas WHERE usuario_id=$1', [entityId]);
    for (const row of memberships.rows) companies.add(row.empresa_id);
  }
  for (const target of companies) {
    await client.query(
      `INSERT INTO sync_change_log(change_id,empresa_id,entidad,entidad_id,operacion,payload,origin_device_id,created_at)
       VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7,NOW())
       ON CONFLICT DO NOTHING`,
      // The source event carries the unique inbound change id. Additional
      // events use NULL (allowed by the unique index); the inbox receipt
      // prevents retries from publishing them twice after a commit.
      [target === companyId ? changeId : null, target, entity, entityId, operation, JSON.stringify(payload), deviceId],
    );
  }
}

module.exports = { publishSyncChange };
