import { readFileSync, writeFileSync } from "node:fs";
import { templates, categories } from "../shared/domain.js";
import { maxUpdateTypes } from "../server/max-events.js";
import { format } from "prettier";

const path = new URL("../openapi.json", import.meta.url);
const spec = JSON.parse(readFileSync(path, "utf8"));
const input = spec.components.schemas.EventInput.properties;
input.templateId.enum = templates.map((t) => t.id);
input.category.enum = Object.keys(categories);
const webhook =
  spec.paths["/max/webhook"].post.requestBody.content["application/json"]
    .schema;
webhook.properties.update_type.enum = maxUpdateTypes;
webhook.properties.callback = {
  type: "object",
  required: ["callback_id", "payload", "user"],
  properties: {
    callback_id: { type: "string", minLength: 1, maxLength: 256 },
    payload: { type: "string", maxLength: 128 },
    user: { type: "object", additionalProperties: true },
  },
};
writeFileSync(path, await format(JSON.stringify(spec), { parser: "json" }));
