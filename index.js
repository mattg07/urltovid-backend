import express from "express";
import uniqid from "uniqid";
import fs from "fs";
import cors from "cors";
import { GPTScript, RunEventType } from "@gptscript-ai/gptscript";
import * as dotenv from "dotenv";
import ffmpeg from "fluent-ffmpeg";
import ffmpegPath from "ffmpeg-static";
import path from "path";

dotenv.config();

const g = new GPTScript();

const app = express();
app.use(cors());

ffmpeg.setFfmpegPath(ffmpegPath);

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

app.get("/build-video", async (req, res) => {
  const id = "50ck4ducm35y432x"; // Use hardcoded id for testing
  const dir = path.join("./stories/", id); // Correctly construct directory path

  console.log("Directory for assets:", dir);

  // Verify if the directory exists
  if (!fs.existsSync(dir)) {
    return res.status(404).json({ message: "Story directory not found" });
  }

  const images = ["b-roll-1.png", "b-roll-2.png", "b-roll-3.png"];
  const audio = ["voiceover-1.mp3", "voiceover-2.mp3", "voiceover-3.mp3"];
  const sub = ["voiceover-1.srt", "voiceover-2.srt", "voiceover-3.srt"];
  console.log(dir);
  for (let i = 0; i < images.length; i++) {
    const inputImage = path.join(dir, images[i]);
    const inputAudio = path.join(dir, audio[i]);
    const inputSub = path.join(dir, sub[i]).replace(/\\/g, "/");
    const outputVideo = path.join(dir, `output_${i}.mp4`);

    console.log("Input Image:", inputImage);
    console.log("Input Audio:", inputAudio);

    // Verify if the files exist
    if (!fs.existsSync(inputImage)) {
      console.error(`Image file not found: ${inputImage}`);
      continue;
    }
    if (!fs.existsSync(inputAudio)) {
      console.error(`Audio file not found: ${inputAudio}`);
      continue;
    }
    if (!fs.existsSync(inputSub)) {
      console.error(`Sub file not found: ${inputSub}`);
      continue;
    }

    await new Promise((resolve, reject) => {
      ffmpeg()
        .input(inputImage)
        .input(inputAudio)
        .input(inputSub)  // Input subtitle file (e.g., .srt or .ass)
        .videoCodec("libx264") // Set video codec
        .audioCodec("copy") // Copy the audio without re-encoding
        .outputOptions([`-vf subtitles=${inputSub}`,
          "-preset veryfast",
          "-strict experimental",
          "-pix_fmt yuv420p"
        ])
        .on("end", resolve)
        .on("error", (err, stdout, stderr) => {
          console.error("Error: " + err.message);
          console.error("ffmpeg stdout: " + stdout);
          console.error("ffmpeg stderr: " + stderr);
          reject(err);
        })
        .save(outputVideo);
    });
    console.log("ready processing");
  }

  return res.json({ message: "Video segments created successfully" });
});
app.listen(8080, () => console.log("Listening on port 8080"));
