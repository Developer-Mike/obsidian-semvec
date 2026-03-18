import { create } from "@orama/orama"

export function createDatabase() {
  return create({
    schema: {
      id: "string",
      path: "string",
      heading: "string",
      content: "string",
      embedding: "vector[768]",
      lastModified: "number",
    },
  })
}
