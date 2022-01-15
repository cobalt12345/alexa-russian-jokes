'use strict';

const AWS = require('aws-sdk');
const axios = require('axios').default;
const { Buffer } = require('buffer');
const i18n = require('i18next');
const { PollyClient, StartSpeechSynthesisTaskCommand } = require("@aws-sdk/client-polly");
const {escapeXmlCharacters} = require("ask-sdk-core");

const ContentType = {
    'ANECDOTES': 1,
    'APHORISMS': 4,
    'ADULTS': 11,
    valueOf(num) {
        switch (num) {
            case 1:
                return 'ANECDOTES';
            case 4:
                return 'APHORISMS';
            case 11:
                return 'ADULTS';
            default:
                throw new Error(`Unknown ContentType: ${num}`);
        }
    }
}

module.exports.ContentType = ContentType;

const s3SigV4Client = new AWS.S3({
    signatureVersion: 'v4'
});

module.exports.getS3PreSignedUrl = function getS3PreSignedUrl(s3ObjectKey) {

    const bucketName = process.env.S3_PERSISTENCE_BUCKET;
    const s3PreSignedUrl = s3SigV4Client.getSignedUrl('getObject', {
        Bucket: bucketName,
        Key: s3ObjectKey,
        Expires: process.env.PRE_SIGNED_URL_EXPIRES_IN_MINUTES * 60 //seconds
    });
    console.log(`Util.s3PreSignedUrl: ${s3PreSignedUrl} Object key: ${s3ObjectKey}`);

    return s3PreSignedUrl;

}

async function getFunnyContent (contentType = 1) {
    axios.defaults.headers.get['Accept'] = 'application/json; charset=utf-8';
    const response = await axios({
        method: "get",
        url: `${process.env.JOKES_URL}?CType=${contentType}`,
        responseType: "arraybuffer",
        responseEncoding: 'windows-1251'
    });
    const data = response.data;
    console.debug('Raw data:', data.toString());
    const textDecoder = new TextDecoder('windows-1251');
    const winDecodedResponse = textDecoder.decode(data);
    const textEncoder = new TextEncoder();
    const utfEncodedResponse = Buffer.from(textEncoder.encode(winDecodedResponse).buffer).toString();

    return utfEncodedResponse;
}
module.exports.getFunnyContent = getFunnyContent;

const REGEX_CARRIAGE_RETURN = /(?:\\[rn]|[\r\n])/g;
const REGEX_HYPHEN = /([-]|- )/g;
const REGEX_ELLIPSIS = /(\.\.\.)/g;
const REGEX_ELLIPSIS_MARK = /(([!?])\.\.)/g;
const REGEX_CONTENT = /{"content":"(.*)"}/g;

const Replacement = function (oldVal, newVal) {
    this.oldVal = oldVal;
    this.newVal = newVal;
}

function removeNoiseCharacters(inputText,
                                                 filter = [
                                                     new Replacement(REGEX_CARRIAGE_RETURN, ' '),
                                                     new Replacement(REGEX_HYPHEN, ''),
                                                     new Replacement(REGEX_ELLIPSIS, '.'),
                                                     new Replacement(REGEX_ELLIPSIS_MARK, '$2'),
                                                     new Replacement(REGEX_CONTENT, '$1')
                                                 ]) {

    for (let replacement of filter) {
        inputText = inputText.toString().replace(replacement.oldVal, replacement.newVal);
    }

    return inputText;
}

module.exports.LocalizationInterceptor = {
    process(handlerInput) {
        const localizationClient = i18n.init({
            lng: handlerInput.requestEnvelope.request.locale || 'en-US',
            resources: require('./i18n'),
            returnObjects: true
        });
        localizationClient.localize = function localize() {
            const args = arguments;
            const value = i18n.t(...args);
            if (Array.isArray(value))
                return value[Math.floor(Math.random() * value.length)];
            return value;
        };
        handlerInput.t = function translate(...args) {
            return localizationClient.localize(...args);
        }
    }
};

class Joke {
    constructor(text, audioFileUri) {
        this.text = text;
        this.audioFileUri = audioFileUri;
    }
}

module.exports.Joke = Joke;

async function getNewJoke(jokes, contentType) {
    console.debug('Get new joke: ' + ContentType.valueOf(contentType) + '/' + contentType);
    const content = await getFunnyContent(contentType);
    console.debug('Funny content: ', content);
    const cleanedContent = removeNoiseCharacters(content);
    console.debug('Cleaned content: ', cleanedContent);
    const clearText = cleanedContent;//JSON.parse(cleanedContent)['content'];
    const escapedText = escapeXmlCharacters(clearText);
    const ssml = `<speak><prosody volume="x-loud"><lang xml:lang="ru-RU">${escapedText}</lang></prosody></speak>`;
    console.debug('SSML data:', ssml);
    const Joke = await text2Speech(ssml, contentType);

    const numOfJokes = jokes.push(Joke);
    console.log(`Just added a joke (${ContentType.valueOf(contentType)}/${contentType}) #`, numOfJokes);
}

module.exports.getNewJoke = getNewJoke;

async function text2Speech(jokeText, contentType) {
    const s3Prefix = `${ContentType.valueOf(contentType)}/joke`;
    console.debug(`Transcode a joke: ${jokeText}. S3 prefix: ${s3Prefix}`);
    const client = new PollyClient({region: 'eu-central-1'});
    const command = new StartSpeechSynthesisTaskCommand({
        Engine: 'standard',
        OutputFormat: 'mp3',
        Text: jokeText,
        TextType: 'ssml',
        OutputS3BucketName: process.env.S3_PERSISTENCE_BUCKET,
        OutputS3KeyPrefix: s3Prefix,
        VoiceId: "Tatyana"
    });

    const response = await client.send(command);
    console.debug('Synth. speech task response:', JSON.stringify(response));

    return new Joke(jokeText, response.SynthesisTask.OutputUri);
}