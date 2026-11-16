// Builds an importable n8n workflow pre-filled with this workspace's hub address and key.
// Flow 1: "Guest message" webhook → forward to TukTuk24. Flow 2: "Reply" webhook (TukTuk24 calls it) → route by channel.
export function buildN8nWorkflow(inboundUrl: string, key: string) {
  const forward = {
    parameters: {
      method: "POST",
      url: inboundUrl,
      sendHeaders: true,
      headerParameters: { parameters: [{ name: "X-TT24-Key", value: key }] },
      sendBody: true,
      specifyBody: "json",
      jsonBody:
        "={{ JSON.stringify({ channel: $json.body.channel || 'whatsapp', account: $json.body.account || 'n8n', from: $json.body.from, name: $json.body.name, text: $json.body.text, message_id: $json.body.message_id || $execution.id }) }}",
      options: {},
    },
    name: "Send to TukTuk24",
    type: "n8n-nodes-base.httpRequest",
    typeVersion: 4.2,
    position: [480, 200],
  };
  return {
    name: "TukTuk24 Automation Hub",
    nodes: [
      {
        parameters: { httpMethod: "POST", path: "tt24-incoming", options: {} },
        name: "Guest message (connect your apps here)",
        type: "n8n-nodes-base.webhook",
        typeVersion: 2,
        position: [240, 200],
        webhookId: "tt24-incoming",
      },
      forward,
      {
        parameters: {
          httpMethod: "POST",
          path: "tt24-reply",
          responseMode: "onReceived",
          options: {},
        },
        name: "Reply from TukTuk24",
        type: "n8n-nodes-base.webhook",
        typeVersion: 2,
        position: [240, 420],
        webhookId: "tt24-reply",
      },
      {
        parameters: {
          rules: {
            values: ["whatsapp", "instagram", "messenger", "email"].map((c) => ({
              conditions: {
                conditions: [
                  {
                    leftValue: "={{ $json.body.channel }}",
                    rightValue: c,
                    operator: { type: "string", operation: "equals" },
                  },
                ],
                combinator: "and",
                options: { caseSensitive: true, typeValidation: "loose" },
              },
              renameOutput: true,
              outputKey: c,
            })),
          },
          options: {},
        },
        name: "Route by channel (add send nodes)",
        type: "n8n-nodes-base.switch",
        typeVersion: 3,
        position: [480, 420],
      },
    ],
    connections: {
      "Guest message (connect your apps here)": {
        main: [[{ node: "Send to TukTuk24", type: "main", index: 0 }]],
      },
      "Reply from TukTuk24": {
        main: [[{ node: "Route by channel (add send nodes)", type: "main", index: 0 }]],
      },
    },
    settings: { executionOrder: "v1" },
  };
}
