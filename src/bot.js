const {
    Client,
    GatewayIntentBits,
    Partials,
    EmbedBuilder,
} = require("discord.js");
const {
    VoiceConnectionStatus,
    createAudioResource,
    joinVoiceChannel,
    entersState,
} = require("@discordjs/voice");
const ytsr = require("ytsr");
const play = require("play-dl");
const { readFile } = require("fs");
const axios = require("axios");

const printDebugMessage = require("./debug");

function createClient() {
    return new Client({
        intents: [
            GatewayIntentBits.Guilds,
            GatewayIntentBits.GuildMessages,
            GatewayIntentBits.MessageContent,
            GatewayIntentBits.GuildVoiceStates,
            GatewayIntentBits.GuildMembers,
            GatewayIntentBits.GuildMessageReactions,
        ],
        partials: [Partials.Channel, Partials.Message, Partials.GuildMember],
    });
}

async function retrieveBotInfo() {
    return new Promise((resolve, reject) => {
        readFile("./src/bot-config.json", "utf-8", (error, data) => {
            if (error) {
                printDebugMessage(error.message, true);
                reject(error);
            }
            const map = new Map();

            //iterate over the object properties and add them to the map
            for (const [key, value] of Object.entries(JSON.parse(data))) {
                map.set(key, value);
            }

            resolve(map);
        });
    });
}

function createConnection(voiceChannel) {
    let connection;
    try {
        connection = joinVoiceChannel({
            channelId: voiceChannel.id,
            guildId: voiceChannel.guild.id,
            adapterCreator: voiceChannel.guild.voiceAdapterCreator,
            selfDeaf: true,
        });

        connection.on(VoiceConnectionStatus.Ready, () => {
            printDebugMessage("Voice connection is ready!", false);
        });

        connection.on(
            VoiceConnectionStatus.Disconnected,
            async (oldState, newState) => {
                printDebugMessage(
                    "[-]Voice connection has been disconnected!",
                    false
                );
                try {
                    await Promise.race([
                        entersState(
                            connection,
                            VoiceConnectionStatus.Signalling,
                            5000
                        ),
                        entersState(
                            connection,
                            VoiceConnectionStatus.Connecting,
                            5000
                        ),
                    ]);
                    //seems to be reconnecting to a new channel - ignore disconnect
                } catch (error) {
                    //seems to be a real disconnect which SHOULDN'T be recovered from
                    connection.destroy();
                    connection = null;
                }
            }
        );

        connection.on(
            VoiceConnectionStatus.Destroyed,
            async (oldState, newState) => {
                printDebugMessage(
                    "[-]Voice connection has been destroyed!",
                    false
                );
            }
        );

        connection.on("error", (error) => {
            printDebugMessage(error.message, true);
        });
    } catch (error) {
        printDebugMessage(error.message, true);
    }

    return connection;
}

async function search(query, limit = 1, type = "video") {
    const options = {
        limit: limit,
    };
    const searchResults = await ytsr(query, options);

    //filter items with type "video"
    const filteredResults = searchResults.items.filter((item) => {
        if (item.type === type) return item;
    });

    if (!filteredResults.length) return null;
    return filteredResults;
}

async function searchLyrics(token, title, artist) {
    try {
        const response = await axios.get(
            `https://api.genius.com/search?q=${artist} ${title}`,
            {
                headers: {
                    Authorization: `Bearer ${token}`,
                },
            }
        );

        const firstResult = response.data.response.hits[0];

        if (firstResult) {
            const id = firstResult.result.id;
            const lyricsResponse = await axios.get(
                `https://api.genius.com/songs/${id}`,
                {
                    headers: {
                        Authorization: `Bearer ${token}`,
                    },
                }
            );

            return lyricsResponse.data.response.song.url;
        }
        return null;
    } catch (error) {
        printDebugMessage(error.message, true);
    }
}

function parseVideoInfo(info) {
    try {
        let title = null,
            artist = null;
        let duration = info.video_details.durationRaw;

        const music = info.video_details.music[0];

        if (music && music.length != 0) {
            title = music.song;
            artist = music.artist;
        } else {
            title = info.video_details.title;
            artist = info.video_details.channel.name;
        }

        return [title, artist, duration];
    } catch (error) {
        printDebugMessage(error.message, true);
        return [null, null, null];
    }
}

async function createResource(info) {
    try {
        const stream = await play.stream_from_info(info);
        const resource = createAudioResource(stream.stream, {
            inputType: stream.type,
        });
        return resource;
    } catch (error) {
        printDebugMessage(error.message, true);
    }
}

function sendEmbed(txtChannel, description, color, title = null, url = null) {
    return new Promise((resolve, reject) => {
        const embed = new EmbedBuilder();
        embed.setDescription(description);
        embed.setColor(color);

        if (title) embed.setTitle(title);
        if (url) embed.setThumbnail(url);
        if (title && url) {
            embed.setTitle(title);
            embed.setThumbnail(url);
        }

        txtChannel
            .send({ embeds: [embed] })
            .then((sentMsg) => {
                resolve(sentMsg);
            })
            .catch((error) => {
                reject(error);
            });
    });
}

module.exports = {
    createClient,
    retrieveBotInfo,
    createConnection,
    search,
    searchLyrics,
    parseVideoInfo,
    createResource,
    sendEmbed,
};
