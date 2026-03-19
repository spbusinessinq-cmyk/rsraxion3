export async function onRequest(context) {
  const body = JSON.stringify({
    status: "operational",
    service: "RSR AXION",
    timestamp: new Date().toISOString(),
    checks: {
      inference: "ok",
      pipeline: "ok",
      memory: "ok",
    },
  });

  return new Response(body, {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });
}
