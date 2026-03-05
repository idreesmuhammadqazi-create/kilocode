import z from "zod"
import { Tool } from "./tool"
import { EditTool } from "./edit"
import DESCRIPTION from "./multiedit.txt"
import path from "path"
import { Instance } from "../project/instance"

export const MultiEditTool = Tool.define("multiedit", {
  description: DESCRIPTION,
  parameters: z.object({
    edits: z
      .array(
        z.object({
          filePath: z.string().describe("The absolute path to the file to modify"),
          oldString: z.string().describe("The text to replace"),
          newString: z.string().describe("The text to replace it with (must be different from oldString)"),
          replaceAll: z.boolean().optional().describe("Replace all occurrences of oldString (default false)"),
        }),
      )
      .describe("Array of edit operations to perform sequentially"),
  }),
  async execute(params, ctx) {
    const tool = await EditTool.init()
    const results = []
    for (const edit of params.edits) {
      const result = await tool.execute(
        {
          filePath: edit.filePath,
          oldString: edit.oldString,
          newString: edit.newString,
          replaceAll: edit.replaceAll,
        },
        ctx,
      )
      results.push(result)
    }
    const files = [...new Set(params.edits.map((e) => path.relative(Instance.worktree, e.filePath)))]
    const title = files.length === 1 ? files[0] : `Modified ${files.length} files`
    return {
      title,
      metadata: {
        results: results.map((r) => r.metadata),
      },
      output: results.map((r) => r.output).join("\n"),
    }
  },
})
