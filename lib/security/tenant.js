/**
 * Tenant resolver: derive tenant id from headers or environment
 */
export function getTenantId(req) {
  try {
    const header = req.headers['x-tenant-id'] || req.headers['x-tenant'] || null;
    const envDefault = process.env.DEFAULT_TENANT_ID ? parseInt(process.env.DEFAULT_TENANT_ID, 10) : 1;
    if (!header) return envDefault;
    const id = parseInt(Array.isArray(header) ? header[0] : header, 10);
    return Number.isFinite(id) && id > 0 ? id : envDefault;
  } catch {
    return 1;
  }
}

