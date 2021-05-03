import express from "express";
import cors from "cors";
import helmet from "helmet";
import multer from "multer";
import fs from "fs";
import request, { Options } from "request";
import dotenv from "dotenv";
const SoundCloud = require("soundcloud-scraper");
dotenv.config();

interface ResponseError extends Error {
  status?: number;
}

const app = express();

//MULTER CONFIG
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, "./tmp");
  },
  filename: (req, file, cb) => {
    cb(null, "blob-" + Date.now());
  },
});
const upload = multer({ storage });

//MIDDLEWARES
app.use(express.json());
app.use(cors({ origin: "http://localhost:3001" }));
app.use(helmet());

//ROUTES
app.post("/soundcloud", async (req, res, next) => {
  try {
    const { radioURL } = req.body;
    const client = new SoundCloud.Client();
    const { streamURL } = await client.getSongInfo(radioURL, {
      fetchStreamURL: true,
    });

    res.send(streamURL);
  } catch (error) {
    next(error);
  }
});

app.post("/shazam", upload.single("file"), (req, res, next) => {
  try {
    //get the file from the request object
    const recording = req.file;

    //request options
    const options: Options = {
      method: "POST",
      url: "https://shazam-core.p.rapidapi.com/v1/tracks/recognize",
      headers: {
        "content-type":
          "multipart/form-data; boundary=---011000010111000001101001",
        "x-rapidapi-key": process.env.RAPIDAPI_KEY,
        "x-rapidapi-host": "shazam-core.p.rapidapi.com",
        useQueryString: true,
      },
      formData: {
        file: {
          value: fs.createReadStream(recording.path),
          options: {
            __filename: recording.filename,
            contentType: "audio/wav",
          },
        },
      },
    };

    //send request to shazam to identify the track
    request(options, async (err, resp, body) => {
      //delete the track from tmp directory
      fs.unlink(recording.path, () => {});

      if (err) next(err);

      const { track } = await JSON.parse(body);

      if (!track) {
        const song = {
          identified: false,
          message: "We couldn't identify this track, please try again",
        };
        return res.json(song);
      }

      const song = {
        identified: true,
        title: track.title,
        artist: track.subtitle,
        coverart: track.images.coverart,
      };

      return res.json(song);
    });
  } catch (error) {
    next(error);
  }
});

//Error handler
app.use((req, res, next) => {
  const error = new Error("Not Found") as ResponseError;
  error.status = 404;
  next(error);
});

app.use((error: ResponseError, req: express.Request, res: express.Response) => {
  res.status(error.status || 500);
  res.json({
    message: error.message,
  });
});

app.listen(3000, () => console.log("LISTENING ON 3000"));
