const express = require("express");
const app = express();
const path = require("path");
const { MongoClient } = require("mongodb");
const bodyParser = require("body-parser");
const multer = require("multer");
const session = require("express-session");
const nodemailer = require("nodemailer");
const fs = require('fs').promises;

// Middleware setup
app.use(bodyParser.urlencoded({ extended: false }));
app.use(express.static("public")); // Serve static files (e.g., images)
app.use(
  session({
    secret: "your-secret-key", // Change this to a secret key for session encryption
    resave: false,
    saveUninitialized: true,
  })
);
app.set("view engine", "hbs");
app.set("views", path.join(__dirname, "../templates"));

const url = "mongodb://0.0.0.0:27017";
const dbName = "blogify";

// Multer storage setup
const storage = multer.memoryStorage(); // Store images in memory (you can configure it to store on disk if needed)
const upload = multer({ storage: storage });

// Nodemailer setup
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: 'param270604@gmail.com',
        pass: 'pmli gtxp xctm ppzj'
    }
});

// Middleware to check if the user is authenticated
const checkAuth = (req, res, next) => {
  if (req.session && req.session.isAuthenticated) {
    return next();
  }
  res.redirect("/login"); // Redirect to login if not authenticated
};

app.get("/login", (req, res) => {
  res.render("log-in");
});

app.get("/user/:email", checkAuth, (req, res) => {
  const userEmail = decodeURIComponent(req.params.email);
  res.render("home", { email: userEmail });
});

app.get("/displayimages", checkAuth, async (req, res) => {
  const userEmail = req.session.userEmail; // Get user's email from session
  const client = new MongoClient(url, { useUnifiedTopology: true });

  try {
    await client.connect();
    const db = client.db(dbName);
    const userCollectionName = userEmail.replace(/[^a-zA-Z0-9]/g, "_"); // Replace non-alphanumeric characters
    const collection = db.collection(userCollectionName);

    // Fetch all images for the current user's email
    const userImages = await collection.find().toArray();

    res.render("displayimages", { email: userEmail, images: userImages });
  } catch (error) {
    console.error(error);
    res.status(500).send("Internal Server Error");
  } finally {
    await client.close();
  }
});

// ... (Previous code)

app.post("/storeimages", checkAuth, upload.array("images"), async (req, res) => {
  let client;

  try {
    client = new MongoClient(url, { useUnifiedTopology: true });
    await client.connect();

    const db = client.db(dbName);
    const userEmail = req.session.userEmail; // Retrieve the user's email from the session

    // Dynamically create a subfolder based on the user's email in the "uploads" folder
    const userFolderPath = path.join(__dirname, 'uploads', userEmail);
    await fs.mkdir(userFolderPath, { recursive: true });

    // Save images in base64 format along with the user's email
    const images = req.files;
    const imagePromises = images.map(async (image, i) => {
      const imageBuffer = image.buffer;

      if (!imageBuffer) {
        return res.status(400).send(`Image buffer is undefined for image ${i + 1}.`);
      }

      const base64Image = imageBuffer.toString("base64");

      const imageData = {
        userEmail: userEmail,
        base64Image: base64Image,
      };

      // Save the image data in the "images_collection" collection
      await db.collection("images_collection").insertOne(imageData);

      // Save the image file to the user's subfolder
      const imageName = `image_${Date.now()}_${i}.${image.mimetype.split('/')[1]}`;
      const imagePath = path.join(userFolderPath, imageName);

      // Convert the imageBuffer to a Buffer
      const buffer = Buffer.from(imageBuffer);

      // Write the Buffer to the file
      await fs.writeFile(imagePath, buffer);
    });

    await Promise.all(imagePromises);
    res.status(200).send("Images uploaded successfully!");
  } catch (error) {
    console.error(error);
    res.status(500).send("Internal Server Error");
  } finally {
    if (client) {
      client.close();
    }
  }
});

// ... (Remaining code)

app.get("/home", checkAuth, (req, res) => {
  const userEmail = req.session.userEmail;
  res.render("home", { email: userEmail });
});

app.get("/signup", (req, res) => {
  res.render("sign-in");
});

app.post("/signup", async (req, res) => {
  let client; // Declare client in a broader scope
  let collection; // Declare collection in a broader scope

  const data = {
    email: req.body.useremail,
    password: req.body.userpassword,
  };

  try {
    // Connect to the database
    client = new MongoClient(url, { useUnifiedTopology: true });
    await client.connect();

    // Store user in "paramdata" collection
    const dbname = client.db("paramshah");
    collection = dbname.collection("paramdata");
    const existingUser = await collection.findOne({ email: data.email });

    if (existingUser) {
      return res.end("User with this email already exists");
    }

    // User does not exist, proceed with creating a new user in "paramdata"
    await collection.insertOne(data);

    // Create a subfolder named after the user's email in the "uploads" folder
    const userFolderPath = path.join(__dirname, 'uploads', data.email);
    await fs.mkdir(userFolderPath, { recursive: true });

    // Set the session variable to mark the user as authenticated after signup
    req.session.isAuthenticated = true;
    req.session.userEmail = data.email; // Store user's email in session

    // Send a welcome email with account information
    const mailOptions = {
      from: 'param270604@gmail.com',
      to: data.email,
      subject: 'Welcome to Blogify',
      text: `Thank you for signing up!\n\nYour account information:\nEmail: ${data.email}\nPassword: ${data.password}`,
    };

    transporter.sendMail(mailOptions, (error, info) => {
      if (error) {
        console.error('Error sending email:', error);
      } else {
        console.log('Email sent:', info.response);
      }
    });

    res.redirect(`/user/${encodeURIComponent(data.email)}`); // Redirect to user's email
  } catch (err) {
    console.error(err);
    res.status(500).send("Internal Server Error");
  } finally {
    if (client) {
      client.close();
    }
  }
});

app.post("/login", async (req, res) => {
  let client; // Declare client in a broader scope

  try {
    const email = req.body.useremail;
    const password = req.body.loginuserpassword; // Get the entered password

    client = new MongoClient(url, { useUnifiedTopology: true });
    await client.connect();

    const dbname = client.db("paramshah");
    const collection = dbname.collection("paramdata");

    const user = await collection.findOne({ email: email, password: password });

    if (!user) {
      res.end("No user found");
    } else {
      // Set the session variable to mark the user as authenticated
      req.session.isAuthenticated = true;
      req.session.userEmail = email; // Store user's email in session
      res.redirect(`/user/${encodeURIComponent(email)}`); // Redirect to user's email
    }
  } catch (err) {
    console.error(err);
    res.status(500).send("Internal Server Error");
  } finally {
    if (client) {
      client.close();
    }
  }
});


app.post("/logout", (req, res) => {
  // Clear the session to log the user out
  req.session.destroy((err) => {
    if (err) {
      console.error("Error destroying session:", err);
      res.status(500).send("Internal Server Error");
    } else {
      res.redirect("/login"); // Redirect to the login page after logout
    }
  });
});

app.listen(3000, () => {
  console.log("Server is running on port 3000");
});
