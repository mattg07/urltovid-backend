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
app.use(express.static('stories'));
ffmpeg.setFfmpegPath(ffmpegPath);

ffmpeg.setFfprobePath("C:/ffmpeg/bin/ffprobe");

app.get("/test", (req, res) => {
  return res.json("test ok");
});

app.get("/create-story", async (req, res) => {
  const url = decodeURIComponent(req.query.url);
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
    return res.json(dir);
  } catch (e) {
    console.error(e);
    return res.json("error");
  }
});

app.get("/build-video", async (req, res) => {
  // const id = "50ck4bnsm39697u3";
  const id = req.query.id;
  if (!id) {
    res.json('error. missing id');
    return;
  }
  const dir = path.join("./stories/", id);

  console.log("Directory for assets:", dir);

  if (!fs.existsSync(dir)) {
    return res.status(404).json({ message: "Story directory not found" });
  }

  const images = ["b-roll-0.png", "b-roll-1.png", "b-roll-2.png"];
  const audio = ["voiceover-0.mp3", "voiceover-1.mp3", "voiceover-2.mp3"];
  const transcriptions = [
    "voiceover-0.txt.verbose_json",
    "voiceover-1.txt.verbose_json",
    "voiceover-2.txt.verbose_json",
  ];
  console.log(dir);
  for (let i = 0; i < images.length; i++) {
    const inputImage = path.join(dir, images[i]);
    const inputAudio = path.join(dir, audio[i]);
    const inputTranscription = path.join(dir, transcriptions[i]);


    //GPTSCRIPT is switching the // to keeps bugging. 
    // const inputSub = path.join(dir, sub[i]).replace(/\\/g, "/");
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

    if (!fs.existsSync(inputTranscription)) {
      console.error(`Transcription file not found: ${inputTranscription}`);
      continue;
    }


    let transcription;
    try {
      transcription = JSON.parse(fs.readFileSync(inputTranscription, "utf8"));
    } catch (err) {
      console.error(
        `Error reading transcription file: ${inputTranscription}`,
        err
      );
      continue;
    }

    const words = transcription.words;
    const duration = parseFloat(transcription.duration).toFixed(2);

    // Build the drawtext filter string. its kind of glitchy
    let drawtextFilter = "";
    words.forEach((wordInfo) => {
      const word = wordInfo.word.replace(/'/g, "\\'").replace(/"/g, '\\"');
      const start = parseFloat(wordInfo.start).toFixed(2);
      const end = parseFloat(wordInfo.end).toFixed(2);
      drawtextFilter += `drawtext=text='${word}':fontcolor=white:fontsize=96:borderw=4:bordercolor=black:x=(w-text_w)/2:y=(h*3/4)-text_h:enable='between(t\\,${start}\\,${end})',`;
    });
    // remove last comma
    drawtextFilter = drawtextFilter.slice(0, -1);

    await new Promise((resolve, reject) => {
      ffmpeg()
        .input(inputImage)
        .loop(duration)
        .videoFilter(drawtextFilter)
        .input(inputAudio)
        .audioCodec("copy") 
        .outputOptions(["-preset veryfast", "-pix_fmt yuv420p"])
        .on("stderr", (stderr) => {
          console.error("FFmpeg STDERR:", stderr); 
        })
        .on("stdout", (stdout) => {
          console.log("FFmpeg STDOUT:", stdout); 
        })
        .on("end", resolve)
        .on("error", (err, stdout, stderr) => {
          console.error("Error: " + err.message);
          console.error("ffmpeg stdout: " + stdout);
          console.error("ffmpeg stderr: " + stderr);
          reject(err);
        })
        .save(outputVideo);
    });
    console.log("ready processing segments");
  }

  console.log('Merging 3 videos together');
  await new Promise((resolve, reject) => {


    ffmpeg()
      .input(path.join(dir, 'output_0.mp4'))
      .input(path.join(dir, 'output_1.mp4'))
      .input(path.join(dir, 'output_2.mp4'))
      .inputOptions(['-f concat', '-safe 0'])
      .outputOptions('-c copy')
      .save(`${dir}/finalVideo.mp4`)
      .on('end', () => {
        console.log('Concatenation succeeded!');
        resolve(); 
      })
      .on("error", (err, stdout, stderr) => {
          console.error("Error: " + err.message);
          console.error("ffmpeg stdout: " + stdout);
          console.error("ffmpeg stderr: " + stderr);
          reject(err);
        })
  });
  return res.json(`${id}/finalVideo.mp4`)

});

app.listen(8080, () => console.log("Listening on port 8080"));
