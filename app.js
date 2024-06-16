const express = require("express");
const app = express();
const usermodel = require("./models/user");
const bcrypt = require("bcrypt");
const cookieParser = require("cookie-parser");
const jwt = require("jsonwebtoken");
const postmodel = require("./models/post");
const path = require('path');
const upload = require("./config/multerconfig");
const fs = require('fs');


app.use(express.static(path.join(__dirname, "public")));
app.set("view engine", "ejs");
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

app.get("/", (req, res) => {
    res.render("index");
});

app.get("/logout", (req, res) => {
    res.clearCookie("token");
    res.redirect("/login");
});

app.post("/register", async (req, res) => {
    try {
        let { email, password, username, name, age } = req.body;
        let user = await usermodel.findOne({ email });
        if (user) return res.status(400).send("User already registered");

        bcrypt.genSalt(10, (err, salt) => {
            if (err) return res.status(500).send("Error generating salt");
            bcrypt.hash(password, salt, async (err, hash) => {
                if (err) return res.status(500).send("Error hashing password");
                try {
                    let newUser = await usermodel.create({
                        username,
                        email,
                        age,
                        name,
                        password: hash
                    });
                    let token = jwt.sign({ email: email, userid: newUser._id }, "shhhh");
                    res.cookie("token", token);
                    res.status(201).send("User registered successfully");
                } catch (error) {
                    res.status(500).send("Error creating user");
                }
            });
        });
    } catch (error) {
        res.status(500).send("Server error");
    }
});

app.post("/upload", isLoggedIn, upload.single("image"), async (req, res) => {
    try {
        let user = await usermodel.findOne({ email: req.user.email });
        user.profile = req.file.filename;   // req.file.filename contains the name of the file
        await user.save();
        res.redirect("/profile");
    } catch (error) {
        res.status(500).send("Error uploading profile picture");
    }
});

app.get("/login", (req, res) => {
    res.render("login");
});

app.get("/profile/upload", (req, res) => {
    res.render("profileup");
});

app.get("/profile", isLoggedIn, async (req, res) => {
    try {
        let user = await usermodel.findOne({ email: req.user.email }).populate({
            path: 'posts',
            populate: {
                path: 'user',
                model: 'user',
                select: 'username email'
            }
        });
        if (!user) {
            return res.status(404).send("User not found");
        }
        res.render("profile", { user: user });
    } catch (error) {
        res.status(500).send("Error loading profile");
    }
});

app.get("/like/:id", isLoggedIn, async (req, res) => {
    try {
        let post = await postmodel.findOne({ _id: req.params.id }).populate("user");
        if (!post) return res.status(404).send("Post not found");

        let userId = req.user.userid;

        if (post.likes.indexOf(userId) === -1) {
            post.likes.push(userId);
        } else {
            post.likes.splice(post.likes.indexOf(userId), 1);
        }

        await post.save();
        res.redirect("/profile");
    } catch (error) {
        res.status(500).send("Error liking the post");
    }
});

app.get("/edit/:id", isLoggedIn, async (req, res) => {
    let post = await postmodel.findOne({ _id: req.params.id }).populate("user");
    if (!post) return res.status(404).send("Post not found");

    res.render("edit", { post });
});

app.post("/update/:id", isLoggedIn, async (req, res) => {
    let post = await postmodel.findOneAndUpdate({ _id: req.params.id }, { content: req.body.content });
    if (!post) return res.status(404).send("Post not found");

    res.redirect("/profile");
});

app.post("/post", isLoggedIn, async (req, res) => {
    try {
        let user = await usermodel.findOne({ email: req.user.email });
        let { content } = req.body;
        let post = await postmodel.create({
            user: user._id,
            content: content,
        });

        user.posts.push(post._id);
        await user.save();
        res.redirect("/profile");
    } catch (error) {
        res.status(500).send("Error creating post");
    }
});

app.post("/login", async (req, res) => {
    try {
        let { email, password } = req.body;
        let user = await usermodel.findOne({ email });
        if (!user) return res.status(400).send("Something went wrong");

        bcrypt.compare(password, user.password, function (err, result) {
            if (err) return res.status(500).send("Server error");

            if (result) {
                let token = jwt.sign({ email: email, userid: user._id }, "shhhh");
                res.cookie("token", token);
                return res.status(200).redirect("/profile");
            } else {
                return res.redirect("/login");
            }
        });
    } catch (error) {
        res.status(500).send("Server error");
    }
});

function isLoggedIn(req, res, next) {
    if (!req.cookies.token) {
        res.redirect("/login");
    } else {
        try {
            let data = jwt.verify(req.cookies.token, "shhhh");
            req.user = data;
            next();
        } catch (error) {
            res.redirect("/login");
        }
    }
}

app.listen(3000, () => {
    console.log("Server is running on port 3000");
});
