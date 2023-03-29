import { Context } from "../context"
import { secrets } from "../../secrets"

// using require to avoid some typescript issues. see:
// https://github.com/openai/openai-node/issues/28#issuecomment-1368110232
const {
  Configuration,
  OpenAIApi,
  ChatCompletionRequestMessageRoleEnum,
} = require("openai")

const configuration = new Configuration({
  apiKey: secrets.openai.key,
})

const openai = new OpenAIApi(configuration)

export class OpenAiDataSource {
  constructor(protected ctx: Context) {
    this.ctx = ctx
  }

  models() {
    return openai.listModels()
  }

  private async attemptMove(boardState: string) {
    const prompt = `
    We are playing a game of tic-tac-toe.
    We represent the game with a 2D array.
    Respond only in JSON form "{ "position": [x, y] }".
    Do not say any other words. I am X, you are O.
    What is your next move based on this board state?
          
    ${boardState}`

    let botMove = null
    try {
      const completion = await openai.createChatCompletion({
        model: "gpt-3.5-turbo-0301",
        temperature: 0.8,
        messages: [
          {
            role: ChatCompletionRequestMessageRoleEnum.System,
            content: "You are an amazing tic tac toe player that never loses.",
          },
          {
            role: ChatCompletionRequestMessageRoleEnum.User,
            content: prompt,
          },
        ],
      })

      botMove = completion.data.choices[0].message?.content
    } catch (error) {
      // https://www.npmjs.com/package/openai
      const e: any = error
      if (e.response) {
        console.log(e.response.status)
        console.log(e.response.data)
      } else {
        console.log(e.message)
      }
    }

    try {
      // @ts-ignore: try/catch takes care of any issues:
      const parsed = JSON.parse(botMove?.trim())
      if (
        parsed.position &&
        parsed.position.length === 2 &&
        parsed.position.every(
          (n: number) => typeof n === "number" && 0 <= n && n <= 2
        )
      ) {
        return parsed
      }
    } catch (error) {
      console.log("ERROR: Failed to parse response from bot", botMove)
    }
  }

  async getBotMove(boardState: string) {
    type Cell = "X" | "O" | null
    type Row = [Cell, Cell, Cell]
    type Board = [Row, Row, Row]
    const prevState = JSON.parse(boardState) as Board

    let validMove = null
    let attempts = 0

    while (!validMove && attempts < 10) {
      attempts += 1
      console.log("attempt:", attempts)
      const attempt = await this.attemptMove(boardState)
      const {
        position: [x, y],
      } = attempt
      if (prevState[y][x] === null) {
        return JSON.stringify(attempt)
      }
    }

    let shimAction: string

    prevState.forEach((row, rowIdx) => {
      row.forEach((_, cellIdx) => {
        if (!shimAction && !prevState[rowIdx][cellIdx]) {
          shimAction = JSON.stringify({
            position: [cellIdx, rowIdx],
          })

          console.warn(
            "Bot failed, submitting action for first open slot",
            shimAction
          )
        }
      })
    })

    return shimAction!
  }
}
