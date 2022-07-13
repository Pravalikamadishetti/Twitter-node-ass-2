const express = require("express");
const { open } = require("sqlite");
const sqlite3 = require("sqlite3");
const path = require("path");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

const databasePath = path.join(__dirname, "twitterClone.db");

const app = express();

app.use(express.json());

let database = null;

const initializeDbAndServer = async () => {
  try {
    database = await open({
      filename: databasePath,
      driver: sqlite3.Database,
    });

    app.listen(3000, () =>
      console.log("Server Running at http://localhost:3000/")
    );
  } catch (error) {
    console.log(`DB Error: ${error.message}`);
    process.exit(1);
  }
};

initializeDbAndServer();

const authenticateToken = (request, response, next) => {
  let jwtToken;
  const authHeader = request.headers["authorization"];
  if (authHeader !== undefined) {
    jwtToken = authHeader.split(" ")[1];
  }
  if (jwtToken === undefined) {
    response.status(401);
    response.send("Invalid JWT Token");
  } else {
    jwt.verify(jwtToken, "secret_code", async (error, payload) => {
      if (error) {
        response.status(401);
        response.send("Invalid JWT Token");
      } else {
        request.username = payload.username;
        next();
      }
    });
  }
};

app.post("/register/", async (request, response) => {
  const { username, name, password, gender, location } = request.body;
  const hashedPassword = await bcrypt.hash(password, 10);
  const selectUserQuery = `SELECT * FROM user WHERE username = '${username}';`;
  const databaseUser = await database.get(selectUserQuery);

  if (databaseUser === undefined) {
    const createUserQuery = `
     INSERT INTO
      user (username, password, name,  gender)
     VALUES
      (
       '${username}',
       '${hashedPassword}',
       '${name}',
       '${gender}'  
      );`;
    if (password.length < 6) {
      response.status(400);
      response.send("Password is too short");
    } else {
      await database.run(createUserQuery);
      response.send("User created successfully");
    }
  } else {
    response.status(400);
    response.send("User already exists");
  }
});

app.post("/login", async (request, response) => {
  const { username, password } = request.body;
  const selectUserQuery = `SELECT * FROM user WHERE username = '${username}';`;
  const databaseUser = await database.get(selectUserQuery);

  if (databaseUser === undefined) {
    response.status(400);
    response.send("Invalid user");
  } else {
    const isPasswordMatched = await bcrypt.compare(
      password,
      databaseUser.password
    );
    if (isPasswordMatched === true) {
      const payload = { username: username };
      const jwtToken = jwt.sign(payload, "secret_code");
      response.send({ jwtToken });
    } else {
      response.status(400);
      response.send("Invalid password");
    }
  }
});

app.get("/user/tweets/feed/", authenticateToken, async (request, response) => {
  const getTweetsQuery = `
    SELECT DISTINCT username,tweet,date_time AS dateTime
    FROM user INNER JOIN tweet ON user.user_id = tweet.user_id INNER JOIN follower ON user.user_id = following_user_id
    ORDER BY date_time DESC
    LIMIT 4;`;
  const tweetsArray = await database.all(getTweetsQuery);
  response.send(tweetsArray);
});

app.get("/user/following/", authenticateToken, async (request, response) => {
  let { username } = request;
  const selectUserQuery = `SELECT user_id FROM user WHERE username = '${username}';`;
  const userId = await database.get(selectUserQuery);
  const getNameOfUsersFollowing = `
  SELECT DISTINCT name
  FROM user INNER JOIN follower ON user.user_id = follower.following_user_id
  WHERE following_user_id IN (SELECT following_user_id
  FROM user INNER JOIN follower
  ON user.user_id = follower.follower_user_id
  WHERE follower_user_id = '${userId.user_id}')
  ORDER BY following_user_id`;
  const followingArray = await database.all(getNameOfUsersFollowing);
  response.send(followingArray);
});

app.get("/user/followers/", authenticateToken, async (request, response) => {
  let { username } = request;
  const selectUserQuery = `SELECT user_id FROM user WHERE username = '${username}';`;
  const userId = await database.get(selectUserQuery);
  const getNameOfUsersFollowing = `
  SELECT DISTINCT name
  FROM user INNER JOIN follower ON user.user_id = follower.follower_user_id
  WHERE follower_user_id IN (SELECT follower_user_id
  FROM user INNER JOIN follower
  ON user.user_id = follower.following_user_id
  WHERE following_user_id = '${userId.user_id}')
  ORDER BY follower_user_id`;
  const followersArray = await database.all(getNameOfUsersFollowing);
  response.send(followersArray);
});

//API6

app.get("/tweets/:tweetId/", authenticateToken, async (request, response) => {
  let { username } = request;
  const selectUserQuery = `SELECT * FROM user WHERE username = '${username}';`;
  const userId = await database.get(selectUserQuery);

  const { tweetId } = request.params;
  const userIdRequestQuery = `
    SELECT user_id
    FROM tweet 
    WHERE tweet_id = ${tweetId};`;
  const userIdRequested = await database.get(userIdRequestQuery);

  const userFollowingArrayQuery = `
  SELECT following_user_id
  FROM user INNER JOIN follower
  ON user.user_id = follower.follower_user_id
  WHERE follower_user_id = '${userId.user_id}';`;
  const userFollowingArray = await database.all(userFollowingArrayQuery);

  const followingList = userFollowingArray.map(
    (object) => object.following_user_id
  );

  if (followingList.includes(userIdRequested.user_id)) {
    const getTweetQuery = `
        SELECT tweet, count(like_id) AS likes, count(reply) AS replies,tweet.date_time AS dateTime
        FROM tweet 
        INNER JOIN follower ON tweet.user_id = follower.follower_user_id 
        INNER JOIN like ON tweet.tweet_id = like.tweet_id 
        INNER JOIN reply ON reply.tweet_id = tweet.tweet_id
        WHERE tweet.tweet_id = ${tweetId} `;
    const tweet = await database.get(getTweetQuery);
    response.send(tweet);
  } else {
    response.status(401);
    response.send("Invalid Request");
  }
});

//API 7

app.get(
  "/tweets/:tweetId/likes/",
  authenticateToken,
  async (request, response) => {
    let { username } = request;
    const selectUserQuery = `SELECT * FROM user WHERE username = '${username}';`;
    const userId = await database.get(selectUserQuery);

    const { tweetId } = request.params;
    const userIdRequestQuery = `
    SELECT user_id
    FROM tweet 
    WHERE tweet_id = ${tweetId};`;
    const userIdRequested = await database.get(userIdRequestQuery);

    const userFollowingArrayQuery = `
    SELECT following_user_id
    FROM user INNER JOIN follower
    ON user.user_id = follower.follower_user_id
    WHERE follower_user_id = '${userId.user_id}';`;
    const userFollowingArray = await database.all(userFollowingArrayQuery);

    const followingList = userFollowingArray.map(
      (object) => object.following_user_id
    );

    if (followingList.includes(userIdRequested.user_id)) {
      const getLikesQuery = `
    SELECT DISTINCT user.username AS likes
    FROM like INNER JOIN user ON user.user_id = like.user_id 
    WHERE tweet_id = ${tweetId}`;
      const likes = await database.all(getLikesQuery);
      const likesList = likes.map((object) => object.likes);
      const likesObject = { likes: likesList };
      response.send(likesObject);
    } else {
      response.status(401);
      response.send("Invalid Request");
    }
  }
);

//API 8

app.get(
  "/tweets/:tweetId/replies/",
  authenticateToken,
  async (request, response) => {
    let { username } = request;
    const selectUserQuery = `SELECT * FROM user WHERE username = '${username}';`;
    const userId = await database.get(selectUserQuery);

    const { tweetId } = request.params;
    const userIdRequestQuery = `
    SELECT user_id
    FROM tweet 
    WHERE tweet_id = ${tweetId};`;
    const userIdRequested = await database.get(userIdRequestQuery);

    const userFollowingArrayQuery = `
    SELECT following_user_id
    FROM user INNER JOIN follower
    ON user.user_id = follower.follower_user_id
    WHERE follower_user_id = '${userId.user_id}';`;
    const userFollowingArray = await database.all(userFollowingArrayQuery);

    const followingList = userFollowingArray.map(
      (object) => object.following_user_id
    );

    if (followingList.includes(userIdRequested.user_id)) {
      const getRepliesQuery = `
    SELECT DISTINCT username AS name,reply
    FROM reply INNER JOIN user ON user.user_id = reply.user_id 
    WHERE tweet_id = ${tweetId}`;
      const repliesList = await database.all(getRepliesQuery);
      const repliesObject = { replies: repliesList };
      response.send(repliesObject);
    } else {
      response.status(401);
      response.send("Invalid Request");
    }
  }
);

//api9

app.get("/user/tweets/", authenticateToken, async (request, response) => {
  let { username } = request;
  const selectUserQuery = `SELECT * FROM user WHERE username = '${username}';`;
  const userId = await database.get(selectUserQuery);
  const getAllTweets = `
  SELECT tweet, count(like_id) AS likes, count(reply) AS replies,tweet.date_time AS dateTime
  FROM user INNER JOIN tweet ON user.user_id = tweet.user_id 
  INNER JOIN like ON tweet.tweet_id = like.tweet_id 
  INNER JOIN reply ON reply.tweet_id = tweet.tweet_id
  WHERE user.user_id = ${userId.user_id}
  GROUP BY tweet.tweet_id;`;
  const tweetsArray = await database.all(getAllTweets);
  response.send(tweetsArray);
});

app.post("/user/tweets/", authenticateToken, async (request, response) => {
  let { username } = request;
  const selectUserQuery = `SELECT * FROM user WHERE username = '${username}';`;
  const userId = await database.get(selectUserQuery);
  const { tweet } = request.body;
  const createTweetQuery = `
    INSERT INTO tweet (tweet,user_id)
    VALUES('${tweet}','${userId.user_id}');`;
  await database.run(createTweetQuery);
  response.send("Created a Tweet");
});

app.delete(
  "/tweets/:tweetId/",
  authenticateToken,
  async (request, response) => {
    let { username } = request;
    const selectUserQuery = `SELECT * FROM user WHERE username = '${username}';`;
    const userId = await database.get(selectUserQuery);
    const { tweetId } = request.params;
    const userIdRequestQuery = `
    SELECT user_id
    FROM tweet 
    WHERE tweet_id = ${tweetId};`;
    const userIdRequested = await database.get(userIdRequestQuery);
    if (userId.user_id === userIdRequested.user_id) {
      const deleteTweetQuery = `
            DELETE  
            FROM tweet
            WHERE tweet_id = ${tweetId};`;
      await database.run(deleteTweetQuery);
      response.send("Tweet Removed");
    } else {
      response.status(401);
      response.send("Invalid Request");
    }
  }
);

module.exports = app;
