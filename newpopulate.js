const color_start = '\x1b[33m%s\x1b[0m'; // yellow
const color_success = '\x1b[32m%s\x1b[0m'; // green
const color_error = '\x1b[31m%s\x1b[0m'; // red

console.log(color_start, 'Started populate.js script...');

const async = require('async');
const Actor = require('./models/Actor.js');
const Script = require('./models/Script.js');
const Notification = require('./models/Notification.js');
const _ = require('lodash');
const dotenv = require('dotenv');
const mongoose = require('mongoose');
const CSVToJSON = require("csvtojson");

//Input Files
const actor_inputFile = './input/actors.csv';
const posts_inputFile = './input/posts.csv';
const replies_inputFile = './input/replies.csv';
const politicalPosts_inputFile = './input/political_posts.csv';
const politicalReplies_inputFile = './input/political_replies.csv';
var globalRepliesCount;
var globalPoliticalRepliesCount;

//const notifications_inputFile = './input/notifications (read, like).csv';
//const notifications_replies_inputFile = './input/notifications (reply).csv';

// Variables to be used later.
var actors_list;
var posts_list;
var comment_list;
//var notification_list;
//var notification_reply_list;
var political_posts_list;
var political_replies_list;
dotenv.config({ path: '.env' });

mongoose.connect(process.env.MONGODB_URI || process.env.MONGOLAB_URI, { useNewUrlParser: true });
var db = mongoose.connection;
mongoose.connection.on('error', (err) => {
    console.error(err);
    console.log(color_error, '%s MongoDB connection error. Please make sure MongoDB is running.');
    process.exit(1);
});

/*
This is a huge function of chained promises, done to achieve serial completion of asynchronous actions.
There's probably a better way to do this, but this worked.
*/
async function doPopulate() {
    /****
    Dropping collections
    ****/
    let promise = new Promise((resolve, reject) => { //Drop the actors collection
            console.log(color_start, "Dropping actors...");
            db.collections['actors'].drop(function(err) {
                console.log(color_success, 'Actors collection dropped');
                resolve("done");
            });
        }).then(function(result) { //Drop the scripts collection
            return new Promise((resolve, reject) => {
                console.log(color_start, "Dropping scripts...");
                db.collections['scripts'].drop(function(err) {
                    console.log(color_success, 'Scripts collection dropped');
                    resolve("done");
                });
            });
        }).then(function(result) { //Drop the notifications collection
            return new Promise((resolve, reject) => {
                console.log(color_start, "Dropping notifications...");
                db.collections['notifications'].drop(function(err) {
                    console.log(color_success, 'Notifications collection dropped');
                    resolve("done");
                });
            });
            /***
            Converting CSV files to JSON
            ***/
        }).then(function(result) { //Convert the actors csv file to json, store in actors_list
            return new Promise((resolve, reject) => {
                console.log(color_start, "Reading actors list...");
                CSVToJSON().fromFile(actor_inputFile).then(function(json_array) {
                    actors_list = json_array;
                    console.log(color_success, "Finished getting the actors_list");
                    resolve("done");
                });
            });
        }).then(function(result) { //Convert the posts csv file to json, store in posts_list
            return new Promise((resolve, reject) => {
                console.log(color_start, "Reading posts list...");
                CSVToJSON().fromFile(posts_inputFile).then(function(json_array) {
                    posts_list = json_array;
                    console.log(color_success, "Finished getting the posts list");
                    resolve("done");
                });
            });
        }).then(function(result) { //Convert the comments csv file to json, store in comment_list
            return new Promise((resolve, reject) => {
                console.log(color_start, "Reading comment list...");
                CSVToJSON().fromFile(replies_inputFile).then(function(json_array) {
                    comment_list = json_array;
                    console.log(color_success, "Finished getting the comment list");
                    resolve("done");
                });
            });
        }).then(function(result) { //Convert the political posts csv file to json, store in political_posts_list
            return new Promise((resolve, reject) => {
                console.log(color_start, "Reading political posts list...");
                CSVToJSON().fromFile(politicalPosts_inputFile).then(function(json_array) {
                    political_posts_list = json_array;
                    console.log(color_success, "Finished getting the political posts list");
                    resolve("done");
                });
            });
        }).then(function(result) { //Convert the political replies csv file to json, store in political_replies_list
            return new Promise((resolve, reject) => {
                console.log(color_start, "Reading political replies list...");
                CSVToJSON().fromFile(politicalReplies_inputFile).then(function(json_array) {
                    political_replies_list = json_array;
                    console.log(color_success, "Finished getting the political replies list");
                    resolve("done");
                });
            });
        }).then(function(result) {
            console.log(color_start, "Counting replies for posts...");
            globalRepliesCount = countRepliesForPosts(comment_list);
            globalPoliticalRepliesCount = countRepliesForPosts(political_replies_list);
            console.log(color_success, "Replies counted");
        }).then(function(result) {
            console.log(color_start, "Starting to populate actors collection...");
            return new Promise((resolve, reject) => {
                async.each(actors_list, async function(actor_raw, callback) {
                        const actordetail = {
                            username: actor_raw.username,
                            profile: {
                                name: actor_raw.name,
                                gender: actor_raw.gender,
                                age: actor_raw.age,
                                location: actor_raw.location,
                                bio: actor_raw.bio,
                                picture: actor_raw.picture
                            },
                            class: actor_raw.class
                        };

                        const actor = new Actor(actordetail);
                        try {
                            await actor.save();
                        } catch (err) {
                            console.log(color_error, "ERROR: Something went wrong with saving actor in database");
                            next(err);
                        }
                    },
                    function(err) {
                        if (err) {
                            console.log(color_error, "ERROR: Something went wrong with saving actors in database");
                            callback(err);
                        }
                        // Return response
                        console.log(color_success, "All actors added to database!")
                        resolve('Promise is resolved successfully.');
                        return 'Loaded Actors';
                    }
                );
            });
            /*************************
            Create each post and upload it to the DB
            Actors must be in DB first to add them correctly to the post
            *************************/
        }).then(function(result) {
            console.log(color_start, "Starting to populate posts collection...");
            return new Promise((resolve, reject) => {
                async.each(posts_list.concat(political_posts_list), async function(new_post, callback) {
                    const act = await Actor.findOne({ username: new_post.actor }).exec();
                    if (act) {
                        let likes = 0;
                        if (new_post.class === 'Food') {
                            likes = globalRepliesCount[new_post.id] || 0;
                        } else if (new_post.class === 'Politics') {
                            likes = globalPoliticalRepliesCount[new_post.id] || 0;
                        }
                        if (likes === 7 || likes === 8 || likes === 9) {
                            let min = likes;
                            let max = likes + 1;
                            likes = Math.round((Math.random() * (max - min) + min) * 100);
                        } else {
                            likes = Math.round(getRandomBetween(0, 20, 3));
                        }
                        const postdetail = {
                            postID: new_post.id,
                            body: new_post.body,
                            picture: new_post.picture,
                            likes: likes,
                            actor: act,
                            time: timeStringToNum(new_post.time) || null,
                            class: new_post.class
                        }
        
                        const script = new Script(postdetail);
                        try {
                            await script.save();
                        } catch (err) {
                            console.log(color_error, "ERROR: Something went wrong with saving post in database");
                            next(err);
                        }
                    } else { //Else no actor found
                        console.log(color_error, "ERROR: Actor not found in database");
                        callback();
                    };
                }, function(err) {
                    if (err) {
                        console.log(color_error, "ERROR: Something went wrong with saving posts in database");
                        callback(err);
                    }
                    // Return response
                    console.log(color_success, "All posts added to database!")
                    resolve('Promise is resolved successfully.');
                    return 'Loaded Posts';
                });
            });
        })// Process food post replies
        .then(function(result) {
            console.log(color_start, "Starting to populate food post replies...");
            return new Promise((resolve, reject) => {
                async.eachSeries(comment_list, async function(new_reply, callback) {
                    const act = await Actor.findOne({ username: new_reply.actor }).exec();
                    if (act) {
                        const pr = await Script.findOne({ postID: new_reply.postID, class: 'Food' }).exec();
                        if (pr) {
                            const comment_detail = {
                                commentID: new_reply.id,
                                body: new_reply.body,
                                likes: getLikesComment(),
                                actor: act,
                                time: timeStringToNum(new_reply.time),
                                class: new_reply.class
                            };
        
                            pr.comments.push(comment_detail);
                            pr.comments.sort(function(a, b) { return a.time - b.time; });
        
                            try {
                                await pr.save();
                            } catch (err) {
                                console.log(color_error, "ERROR: Something went wrong with saving reply in database");
                                next(err);
                            }
                        } else { //Else no post found
                            console.log(color_error, "ERROR: Food post not found in database");
                            callback();
                        }
        
                    } else { //Else no actor found
                        console.log(color_error, "ERROR: Actor not found in database");
                        callback();
                    }
                }, function(err) {
                    if (err) {
                        console.log(color_error, "ERROR: Something went wrong with saving food replies in database");
                        callback(err);
                    }
                    // Return response
                    console.log(color_success, "All food replies added to database!");
                    resolve('Promise is resolved successfully.');
                    return 'Loaded Food Replies';
                });
            });
        })
        
        // Process political post replies
        .then(function(result) {
            console.log(color_start, "Starting to populate political post replies...");
            return new Promise((resolve, reject) => {
                async.eachSeries(political_replies_list, async function(new_reply, callback) {
                    const act = await Actor.findOne({ username: new_reply.actor }).exec();
                    if (act) {
                        const pr = await Script.findOne({ postID: new_reply.postID, class: 'Politics' }).exec();
                        if (pr) {
                            const comment_detail = {
                                commentID: new_reply.id,
                                body: new_reply.body,
                                likes: getLikesComment(),
                                actor: act,
                                time: timeStringToNum(new_reply.time),
                                class: new_reply.class
                            };
        
                            pr.comments.push(comment_detail);
                            pr.comments.sort(function(a, b) { return a.time - b.time; });
        
                            try {
                                await pr.save();
                            } catch (err) {
                                console.log(color_error, "ERROR: Something went wrong with saving political reply in database");
                                next(err);
                            }
                        } else { //Else no post found
                            console.log(color_error, "ERROR: Political post not found in database");
                            callback();
                        }
        
                    } else { //Else no actor found
                        console.log(color_error, "ERROR: Actor not found in database");
                        callback();
                    }
                }, function(err) {
                    if (err) {
                        console.log(color_error, "ERROR: Something went wrong with saving political replies in database");
                        callback(err);
                    }
                    // Return response
                    console.log(color_success, "All political replies added to database!");
                    mongoose.connection.close();
                    resolve('Promise is resolved successfully.');
                    return 'Loaded Political Replies';
                });
            });
        })
        
}

//capitalize a string
String.prototype.capitalize = function() {
    return this.charAt(0).toUpperCase() + this.slice(1);
}

//Transforms a time like -12:32 (minus 12 hours and 32 minutes) into a time in milliseconds
//Positive numbers indicate future posts (after they joined), Negative numbers indicate past posts (before they joined)
//Format: (+/-)HH:MM
function timeStringToNum(v) {
    var timeParts = v.split(":");
    if (timeParts[0] == "-0")
    // -0:XX
        return -1 * parseInt(((timeParts[0] * (60000 * 60)) + (timeParts[1] * 60000)), 10);
    else if (timeParts[0].startsWith('-'))
    //-X:XX
        return parseInt(((timeParts[0] * (60000 * 60)) + (-1 * (timeParts[1] * 60000))), 10);
    else
        return parseInt(((timeParts[0] * (60000 * 60)) + (timeParts[1] * 60000)), 10);
};

//Create a random number (for the number of likes) with a weighted distrubution
//This is for posts
function getLikes() {
    var notRandomNumbers = [0,0,0,0,1, 1, 1, 2, 2, 2, 3, 3, 4, 4, 5, 6];
    var idx = Math.floor(Math.random() * notRandomNumbers.length);
    return notRandomNumbers[idx];
}

//Create a radom number (for likes) with a weighted distrubution
//This is for comments
function getLikesComment() {
    var notRandomNumbers = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 2, 2, 3, 4];
    var idx = Math.floor(Math.random() * notRandomNumbers.length);
    return notRandomNumbers[idx];
}
const countRepliesForPosts = (replies) => {
    return replies.reduce((acc, reply) => {
        acc[reply.postID] = (acc[reply.postID] || 0) + 1;
        return acc;
    }, {});
};
function getRandomBetween(min, max, skew) {
    let u = 0, v = 0;
    while (u === 0) u = Math.random(); // Converting [0,1) to (0,1)
    while (v === 0) v = Math.random();
    let num = Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);

    num = num / 10.0 + 0.5; // Translate to 0 -> 1
    if (num > 1 || num < 0) num = getRandomBetween(min, max, skew); // Resample between 0 and 1 if out of range

    num = Math.pow(num, skew); // Skew
    num *= (max - min); // Stretch to fill range
    num += min; // Offset to min
    return parseFloat(num.toFixed(2));
}

//Call the function with the long chain of promises
doPopulate();