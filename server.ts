import express from "express";
import cors from "cors";
import helmet from "helmet";
import multer from "multer";
import fs from "fs";
import dotenv from "dotenv";
import axios, { AxiosRequestConfig } from "axios";
const FormData = require("form-data");
const SoundCloud = require("soundcloud-scraper");
dotenv.config();

//INTERFACES
interface ResponseError extends Error {
  status?: number;
}

const app = express();

//MULTER CONFIG
const storage = multer.diskStorage({
  destination: "./tmp",
  filename: (req, file, cb) => {
    cb(null, "blob-" + Date.now());
  },
});
const upload = multer({ storage });

//MIDDLEWARES
app.use(cors({ origin: process.env.ORIGIN || "*" }));
app.use(helmet());
app.use(express.json());

//ROUTES
app.post("/soundcloud", async (req, res, next) => {
  try {
    //extract the radio url from request body
    const { radioURL } = req.body;
    //create soundcloud client
    const client = new SoundCloud.Client();
    //fetch the streamurl from the radio url
    const { streamURL } = await client.getSongInfo(radioURL, {
      fetchStreamURL: true,
    });
    //return the stream url
    res.send(streamURL);
  } catch (error) {
    next(error);
  }
});

app.post("/shazam", upload.single("file"), async (req, res, next) => {
  //create array from api keys
  const api_keys = process.env.RAPIDAPI_KEY?.split(",");
  let keyNumber = 0;

  //get the file from the request object
  const recording = req.file;

  //create form-data
  const form = new FormData();
  form.append("file", fs.createReadStream(recording.path), {
    filename: recording.filename,
    contentType: "audio/wav",
  });

  //create form-data headers function
  function getHeaders(form: any) {
    return new Promise((resolve, reject) => {
      form.getLength((err: any, length: any) => {
        if (err) {
          reject(err);
        }
        let headers = Object.assign(
          { "Content-Length": length },
          form.getHeaders()
        );
        resolve(headers);
      });
    });
  }

  //function to identify music
  const identifyMusic = async (API_KEY: string | undefined): Promise<any> => {
    //define headers object
    let headers: { [name: string]: any } = (await getHeaders(form)) as {};
    //add more headers to headers objects
    headers = {
      ...headers,
      "x-rapidapi-key": API_KEY,
      "x-rapidapi-host": "shazam-core.p.rapidapi.com",
    };

    try {
      //send the post request
      let {
        data,
      } = await axios.post(
        "https://shazam-core.p.rapidapi.com/v1/tracks/recognize",
        form,
        { headers }
      );

      //extract track from reponse
      let { track } = data;

      //delete file
      fs.unlink(recording.path, () => {});

      //if the track is not found send a response
      if (!track) {
        const song = {
          identified: false,
          message: "We couldn't identify this track, please try again",
        };
        return res.json(song);
      }

      //create track object
      const song = {
        identified: true,
        title: track.title,
        artist: track.subtitle,
        coverart: track.images.coverart,
      };

      //return the song
      return res.json(song);
    } catch (error) {
      if (error.response) {
        //CHECH IF ERROR STATUS CODE IS 405, THAT MEANS THAT THE MONTHLY QUOTA HAS BEEN REACHED
        if (error.response.status === 405) {
          //if keynumber is less than 3 (size of the keys array)
          if (keyNumber < 3) {
            //TRY WITH ANOTHER KEY
            keyNumber++;
            return identifyMusic(api_keys?.[keyNumber]);
          }
        }
      }
      //forward the error to the handler
      next(error);
    }
  };

  await identifyMusic(api_keys?.[keyNumber]);
});

//Error handler
app.use(
  (req: express.Request, res: express.Response, next: express.NextFunction) => {
    const error = new Error("Not Found") as ResponseError;
    error.status = 404;
    next(error);
  }
);

app.use(((
  error: any,
  req: express.Request,
  res: express.Response,
  next: express.NextFunction
) => {
  res.status(error.status || error.response.status || 500);
  res.json({
    message: error.message,
  });
}) as express.ErrorRequestHandler);

app.listen(process.env.PORT || 3000, () => console.log("LISTENING ON 3000"));
