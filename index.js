import express from "express";
import uniqid from "uniqid";
import fs from "fs";
import cors from "cors";
import { GPTScript, RunEventType } from "@gptscript-ai/gptscript";
import * as dotenv from "dotenv";
dotenv.config();

const g = new GPTScript();

const app = express();
app.use(cors());

app.get("/test", (req, res) => {
  return res.json("test ok");
});

app.get("/create-story", async (req, res) => {
  const url = req.query.url;
  const dir = uniqid();
  const path = "./stories/" + dir;
  fs.mkdirSync(path, { recursive: true });

  console.log({
    url,
  });
  try {
    const run = await g.run("./story.gpt", {
      input: `--url  ${url} --dir ${path}`,
      disableCache: true,
    });

    run.on(RunEventType.Event, (ev) => {
      if (ev.type === RunEventType.CallFinish && ev.output) {
        console.log(ev.output);
      }
    });
    const result = await run.text();
    return res.json(result);
  } catch (e) {
    console.error(e);
    return res.json("error");
  }
});

app.listen(8080, () => console.log("Listening on port 8080"));
