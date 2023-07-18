//TODO add playlists support
//TODO add Spotify links support for both songs and playlists (search module) https://developer.spotify.com/dashboard
//TODO add back, shuffle, jump commands for queueing songs

const {
    AudioPlayerStatus,
    NoSubscriberBehavior,
    VoiceConnectionStatus,
    createAudioPlayer,
} = require("@discordjs/voice");
const { video_info } = require("play-dl");

require("dotenv").config();

const {
    createClient,
    retrieveBotInfo,
    createConnection,
    search,
    searchLyrics,
    parseVideoInfo,
    createResource,
    sendEmbed,
} = require("./bot");

require("./server")(8888);

const client = createClient();

let botName,
    prefix,
    helpCommandList = "";

retrieveBotInfo().then((info) => {
    botName = info.get("name");
    prefix = info.get("prefix");

    const parseHelpJSON = (json) => {
        const parseArr = (arr) => {
            result = "";
            for (const s of arr) {
                result += `${s}\n`;
            }
            return result;
        };

        list = "";
        for (const [key, value] of Object.entries(json)) {
            list += `${key}: ${parseArr(value)}\n   `;
        }
        return list;
    };

    helpCommandList = parseHelpJSON(info.get("help"));
});

let txtChannel;
let voiceChannel;
let connection;
let player;
let subscription;

let queue = [];
let currentSong = null;
const emojis = ["1️⃣", "2️⃣", "3️⃣", "4️⃣", "5️⃣"];
let showedSongs = [];
let previouseCommand;

client.on("ready", () => {
    console.log(`[+]${botName} started!`);
    checkIdle();
});

client.on("messageCreate", async (msg) => {
    const content = msg.content;
    const member = msg.member;
    txtChannel = msg.channel;
    voiceChannel = member.voice.channel;

    if (!content.startsWith(prefix) || msg.author.bot) return;

    const args = content.substring(prefix.length).split(" ");
    const command = args[0];

    switch (command) {
        case "play":
        case "p": {
            console.log(
                `<${msg.author.username}> play ${args.slice(1).join(" ")}`
            );

            if (!connectedToVoiceChannel(txtChannel, voiceChannel)) break;
            if (!isNameGiven(txtChannel, args)) break;

            previouseCommand = "play";

            try {
                if (!connection) startConnection();

                const videos = await search(args.slice(1).join(" "));
                if (!videos || videos.length == 0) {
                    sendEmbed(
                        txtChannel,
                        "Non stati trovati risultati...",
                        "Red"
                    );
                    break;
                }

                //eventually decide what track will be played
                const video = videos[0];
                const info = await video_info(video.url);

                checkPlayerState(info);
            } catch (error) {
                console.error(error);
            }

            break;
        }
        case "play-c":
        case "pc": {
            console.log(
                `<${msg.author.username}> play-c ${args.slice(1).join(" ")}`
            );

            if (!connectedToVoiceChannel(txtChannel, voiceChannel)) break;
            if (!isNameGiven(txtChannel, args)) break;

            previouseCommand = "play-c";

            try {
                if (!connection) startConnection();

                const videos = await search(args.slice(1).join(" "), 5);
                if (!videos || videos.length == 0) {
                    sendEmbed(
                        txtChannel,
                        "Non stati trovati risultati...",
                        "Red"
                    );
                    break;
                }

                showedSongs = videos;

                let videosStr = "";

                videos.forEach((video, index) => {
                    const authorName =
                        video.author && video.author.name
                            ? video.author.name
                            : "Unknown";
                    videosStr += `${index + 1}) **${
                        video.title
                    }** by **${authorName}** (${video.duration})\n`;
                });

                sendEmbed(txtChannel, videosStr, "Blue", "Opzioni").then(
                    (sentMsg) => {
                        videos.forEach((video, index) => {
                            sentMsg.react(emojis[index]);
                        });
                    }
                );
            } catch (error) {
                console.error(error);
            }

            break;
        }
        case "play-u":
        case "pu": {
            console.log(
                `<${msg.author.username}> play-u ${args.slice(1).join(" ")}`
            );

            if (!connectedToVoiceChannel(txtChannel, voiceChannel)) break;
            if (!isNameGiven(txtChannel, args)) break;

            previouseCommand = "play-u";

            try {
                if (!connection) startConnection();

                //eventually decide what track will be played
                const info = await video_info(args[1]);
                checkPlayerState(info);
            } catch (error) {
                console.error(error);
            }

            break;
        }
        case "now-playing":
        case "np": {
            console.log(`<${msg.author.username}> np`);

            previouseCommand = "np";

            //check if a song is currently playing
            if (
                player &&
                player.state.status === AudioPlayerStatus.Playing &&
                currentSong
            ) {
                const parsedInfo = parseVideoInfo(currentSong);
                sendEmbed(
                    txtChannel,
                    `Now playing **${parsedInfo[0]}** by **${parsedInfo[1]}** (${parsedInfo[2]})`,
                    "Blue",
                    null,
                    currentSong.video_details.thumbnails.at(0).url
                );
            } else
                sendEmbed(
                    txtChannel,
                    "Non c'è nessun contenuto in riproduzione!",
                    "Red"
                );

            break;
        }
        case "pause":
        case "ps": {
            console.log(`<${msg.author.username}> pause`);

            if (!connectedToVoiceChannel(txtChannel, voiceChannel)) break;

            previouseCommand = "pause";

            //check if a song is currently playing
            if (player && player.state.status === AudioPlayerStatus.Playing) {
                //pause the current song
                player.pause();
                sendEmbed(txtChannel, "Riproduzione messa in pausa!", "Blue");
            } else
                sendEmbed(
                    txtChannel,
                    "Non c'è nessun contenuto in riproduzione!",
                    "Red"
                );

            break;
        }
        case "unpause":
        case "ups": {
            console.log(`<${msg.author.username}> unpause`);

            if (!connectedToVoiceChannel(txtChannel, voiceChannel)) break;

            previouseCommand = "unpause";

            //check if a song isn't currently playing and there's a song to play
            if (
                player &&
                player.state.status === AudioPlayerStatus.Paused &&
                currentSong
            ) {
                //play the current song
                player.unpause();
                sendEmbed(txtChannel, "Riproduzione ripresa", "Blue");
            } else
                sendEmbed(
                    txtChannel,
                    "Non c'è nessun contenuto in riproduzione!",
                    "Red"
                );

            break;
        }
        case "skip":
        case "s": {
            console.log(`<${msg.author.username}> skip`);

            if (!connectedToVoiceChannel(txtChannel, voiceChannel)) break;

            if (!currentSong) {
                sendEmbed(
                    txtChannel,
                    "Non c'è nessun contenuto da skippare!",
                    "Red"
                );
                break;
            }

            previouseCommand = "skip";

            if (player && player.state.status === AudioPlayerStatus.Playing) {
                //stop the player
                player.stop();

                //skip to the next song in the queue
                playNextSong();
            }

            break;
        }
        case "back":
        case "b": {
            console.log(`<${msg.author.username}> back`);
            break;
        }
        case "lyrics":
        case "l": {
            console.log(`<${msg.author.username}> lyrics`);

            if (!connectedToVoiceChannel(txtChannel, voiceChannel)) break;

            if (!currentSong) {
                sendEmbed(
                    txtChannel,
                    "Non c'è nessun contenuto di cui cercare le lyrics!",
                    "Red"
                );
                break;
            }

            previouseCommand = "lyrics";

            const parsedInfo = parseVideoInfo(currentSong);
            const token =
                process.env.GENIUS_TOKEN || process.env["GENIUS_TOKEN"];

            searchLyrics(token, parsedInfo[0], parsedInfo[1])
                .then((lyrics) => {
                    if (lyrics) sendEmbed(txtChannel, lyrics, "Blue");
                    else sendEmbed(txtChannel, "Lyrics not found", "Blue");
                })
                .catch((error) => {
                    console.error("Error:", error.message);
                });

            break;
        }
        case "queue":
        case "q": {
            console.log(`<${msg.author.username}> queue`);

            if (!connectedToVoiceChannel(txtChannel, voiceChannel)) break;

            previouseCommand = "queue";

            if (!currentSong) {
                sendEmbed(txtChannel, "La coda è vuota!", "Red");
                return;
            }

            const parsedInfo = parseVideoInfo(currentSong);
            let queueStr = `${1}) **${parsedInfo[0]}** by **${
                parsedInfo[1]
            }** (${parsedInfo[2]})`;

            queue.forEach((info, index) => {
                const parsedInfo = parseVideoInfo(info);
                queueStr += `\n${index + 2}) **${parsedInfo[0]}** by **${
                    parsedInfo[1]
                }** (${parsedInfo[2]})`;
            });

            sendEmbed(txtChannel, queueStr, "Blue", "Queue");
            break;
        }
        case "leave": {
            console.log(`<${msg.author.username}> leave`);

            if (VoiceConnectionStatus.Disconnected && queue.length != 0) {
                sendEmbed(
                    txtChannel,
                    "Il bot deve essere all'interno del canale per poterne uscire!",
                    "Red"
                );
                break;
            }

            previouseCommand = "leave";

            if (stopConnection(txtChannel))
                sendEmbed(txtChannel, "Lupo è uscito!", "Blue");

            break;
        }
        case "help":
        case "h": {
            console.log(`<${msg.author.username}> help`);

            previouseCommand = "help";

            sendEmbed(txtChannel, helpCommandList, "Blue", "Comandi");
            break;
        }
    }
});

client.on("messageReactionAdd", async (reaction, user) => {
    if (user.bot || previouseCommand !== "play-c") return;

    let url;

    switch (reaction.emoji.name) {
        case emojis[0]: {
            url = showedSongs[0].url;
            break;
        }
        case emojis[1]: {
            url = showedSongs[1].url;
            break;
        }
        case emojis[2]: {
            url = showedSongs[2].url;
            break;
        }
        case emojis[3]: {
            url = showedSongs[3].url;
            break;
        }
        case emojis[4]: {
            url = showedSongs[4].url;
            break;
        }
    }

    try {
        const info = await video_info(url);
        checkPlayerState(info);
    } catch (error) {
        console.error(error);
    }

    previouseCommand = "";

    // Remove all reactions from the message
    reaction.message.reactions.removeAll().catch(console.error);
});

//finally login
client.login(process.env.DISCORD_TOKEN || process.env["DISCORD_TOKEN"]);

//FUNCTIONS
function startConnection() {
    connection = createConnection(voiceChannel);
    player = createAudioPlayer({
        behaviors: {
            noSubscriber: NoSubscriberBehavior.Play,
        },
    });
    subscription = connection.subscribe(player);
}

function stopConnection(txtChannel) {
    try {
        if (!subscription || !connection) {
            sendEmbed(
                txtChannel,
                "Lupo non è connesso a nessun canale vocale",
                "Red"
            );
            return false;
        }
        subscription.unsubscribe();
        connection.disconnect();
        connection = null;
        currentSong = null;
        queue = [];
        previouseShow = null;

        return true;
    } catch (e) {
        console.error(e);
    }
}

function connectedToVoiceChannel(txtChannel, voiceChannel) {
    if (!voiceChannel) {
        sendEmbed(
            txtChannel,
            "Devi essere connesso ad un canale vocale",
            "Red"
        );
        return false;
    } else return true;
}

function isNameGiven(txtChannel, args) {
    if (!args[1]) {
        sendEmbed(txtChannel, "Inserisci il nome di un contenuto!", "Red");
        return false;
    }
    return true;
}

async function playNextSong() {
    if (queue.length == 0) {
        sendEmbed(txtChannel, "La coda è vuota", "Red");
        currentSong = null;
        return;
    }

    const info = queue.shift();

    if (info) {
        const parsedInfo = parseVideoInfo(info);
        sendEmbed(
            txtChannel,
            `Now playing **${parsedInfo[0]}** by **${parsedInfo[1]}** (${parsedInfo[2]})`,
            "Blue",
            null,
            info.video_details.thumbnails.at(0).url
        );

        currentSong = info;

        const resource = await createResource(info);
        if (resource) player.play(resource);
    }
}

async function checkIdle() {
    //450 times every 2 seconds = 15 minutes of idle
    const timesToCheck = 450;
    let timesChecked = 0;

    while (true) {
        if (
            player &&
            player.state.status === AudioPlayerStatus.Idle &&
            queue &&
            queue.length != 0
        ) {
            //song ended, play the next song
            playNextSong();
        }

        if (player && player.state.status === AudioPlayerStatus.Playing)
            timesChecked = 0;

        //wait for 2 second before checking again
        await new Promise((resolve) => {
            if (timesChecked == timesToCheck) {
                if (connection) {
                    connection.destroy();
                    connection = null;
                }
                timesChecked = 0;
            }
            setTimeout(resolve, 2000);
            timesChecked += 1;
        });
    }
}

function checkPlayerState(info) {
    const addToQueue = () => {
        queue.push(info);
        sendEmbed(
            txtChannel,
            `Added **${info.video_details.title}** to the queue.`,
            "Blue",
            null,
            info.video_details.thumbnails.at(0).url
        );
    };

    const playSong = () => {
        queue.push(info);
        playNextSong();
    };

    //check if a song is currently playing
    if (player.state.status === AudioPlayerStatus.Playing) addToQueue();
    else if (player.state.status === AudioPlayerStatus.Paused) {
        //if its paused but theres a song to play
        if (currentSong) addToQueue();
        else playSong();
    } else if (player.state.status === AudioPlayerStatus.Idle) playSong();
}
