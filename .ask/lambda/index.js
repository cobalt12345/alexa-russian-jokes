// This sample demonstrates handling intents from an Alexa skill using the Alexa Skills Kit SDK (v2).
// Please visit https://alexa.design/cookbook for additional examples on implementing slots, dialog management,
// session persistence, api calls, and more.
const Alexa = require('ask-sdk-core');
const persistenceAdapter = require('ask-sdk-s3-persistence-adapter');
const {escapeXmlCharacters} = require("ask-sdk-core");
const axios = require('axios').default;
const { PollyClient, StartSpeechSynthesisTaskCommand } = require("@aws-sdk/client-polly");
const {getS3PreSignedUrl} = require('./util');
const { Buffer } = require('buffer');

const THERE_ARE_NO_JOKES_YET = [
    'Humor is not my strong skill.',
    'I\'m too serious for jokes.',
    'I don\'t know any jokes.',
    'Ha-ha-ha...',
    'Russians are too serious to joke!',
];
const LaunchRequestHandler = {
    canHandle(handlerInput) {
        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'LaunchRequest';
    },
    handle(handlerInput) {
        const reqAttributes = handlerInput.attributesManager.getRequestAttributes();
        console.log('Launch', reqAttributes);
        if (!reqAttributes || !(reqAttributes['nextJoke'])) {
            const noSelectedJoke = THERE_ARE_NO_JOKES_YET[getRandomInt(0, THERE_ARE_NO_JOKES_YET.length - 1)];

            return handlerInput.responseBuilder
                .speak(noSelectedJoke)
                .getResponse();

        } else {
            const joke = reqAttributes['nextJoke'];
            console.debug('---', 'Next joke:', joke);
            const mp3S3ObjKey = Array.from(joke.audioFileUri.split('/')).pop();
            console.debug('---', 'Object key: ' + mp3S3ObjKey);
            const audioUri = getS3PreSignedUrl(mp3S3ObjKey);
            const escapedAudioUri = escapeXmlCharacters(audioUri);
            console.debug('---', 'Pre-signed URL: ', audioUri);
            console.debug('---', 'Escaped URL: ', escapedAudioUri)

            return handlerInput.responseBuilder.speak(`<audio src="${escapedAudioUri}" />`).getResponse();
        }

    }
};

const HelpIntentHandler = {
    canHandle(handlerInput) {
        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
            && Alexa.getIntentName(handlerInput.requestEnvelope) === 'AMAZON.HelpIntent';
    },
    handle(handlerInput) {
        const speakOutput = 'You can say hello to me! How can I help?';

        return handlerInput.responseBuilder
            .speak(speakOutput)
            .reprompt(speakOutput)
            .getResponse();
    }
};
const CancelAndStopIntentHandler = {
    canHandle(handlerInput) {
        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
            && (Alexa.getIntentName(handlerInput.requestEnvelope) === 'AMAZON.CancelIntent'
                || Alexa.getIntentName(handlerInput.requestEnvelope) === 'AMAZON.StopIntent');
    },
    handle(handlerInput) {
        const speakOutput = 'Goodbye!';
        return handlerInput.responseBuilder
            .speak(speakOutput)
            .getResponse();
    }
};
const SessionEndedRequestHandler = {
    canHandle(handlerInput) {
        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'SessionEndedRequest';
    },
    handle(handlerInput) {
        // Any cleanup logic goes here.
        return handlerInput.responseBuilder.getResponse();
    }
};

// The intent reflector is used for interaction model testing and debugging.
// It will simply repeat the intent the user said. You can create custom handlers
// for your intents by defining them above, then also adding them to the request
// handler chain below.
const IntentReflectorHandler = {
    canHandle(handlerInput) {
        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest';
    },
    handle(handlerInput) {
        const intentName = Alexa.getIntentName(handlerInput.requestEnvelope);
        const speakOutput = `You just triggered ${intentName}`;

        return handlerInput.responseBuilder
            .speak(speakOutput)
            //.reprompt('add a reprompt if you want to keep the session open for the user to respond')
            .getResponse();
    }
};

// Generic error handling to capture any syntax or routing errors. If you receive an error
// stating the request handler chain is not found, you have not implemented a handler for
// the intent being invoked or included it in the skill builder below.
const ErrorHandler = {
    canHandle() {
        return true;
    },
    handle(handlerInput, error) {
        console.log(`~~~~ Error handled: ${error.stack}`);
        const speakOutput = `Sorry, I had trouble doing what you asked. Please try again.`;

        return handlerInput.responseBuilder
            .speak(speakOutput)
            .reprompt(speakOutput)
            .getResponse();
    }
};

function getRandomJoke(jokes) {
    if (!jokes || jokes.length < 2) {
        throw new Error("There must be at least two jokes!");
    }
    const numOfAvailableJokes = jokes.length - 1; //last joke probably not finished yet
    const selectedJoke = getRandomInt(0, numOfAvailableJokes - 1);
    console.log('Selected joke #', selectedJoke, ' ', jokes[selectedJoke]);

    return jokes[selectedJoke];
}

function getRandomInt(min, max) {
    min = Math.ceil(min);
    max = Math.floor(max);
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

async function text2Speech(jokeText) {
    console.debug('Transcode joke: ', jokeText);
    const client = new PollyClient({region: 'eu-west-1'});
    const command = new StartSpeechSynthesisTaskCommand({
        Engine: 'standard',
        OutputFormat: 'mp3',
        Text: jokeText,
        TextType: 'ssml',
        OutputS3BucketName: process.env.S3_PERSISTENCE_BUCKET,
        OutputS3KeyPrefix: '',
        VoiceId: "Tatyana"
    });

    const response = await client.send(command);
    console.debug('Synth. speech task response:', JSON.stringify(response));

    return new Joke(jokeText, response.SynthesisTask.OutputUri);
}


class Joke {
    constructor(text, audioFileUri) {
        this.text = text;
        this.audioFileUri = audioFileUri;
    }
}

const InitJokes = {
    async process(handlerInput) {
        try {
            console.debug(JSON.stringify(handlerInput.requestEnvelope));
            axios.defaults.headers.get['Accept'] = 'application/json; charset=utf-8'
            const response = await axios({
                method: "get",
                url: 'http://rzhunemogu.ru/RandJSON.aspx?CType=1',
                responseType: "arraybuffer",
                responseEncoding: 'windows-1251'
            });
            // console.log('Response type:', typeof (response), 'Data type:', typeof (response.data));
            // console.log('Response:', response.toString());
            // console.log('Data:', response.data.toString());

            const data = response.data;
            console.debug('Raw data:', data.toString());
            const textDecoder = new TextDecoder('windows-1251');
            const winDecodedResponse = textDecoder.decode(data);
            const textEncoder = new TextEncoder();
            const utfEncodedResponse = Buffer.from(textEncoder.encode(winDecodedResponse).buffer).toString();
            const clearText = JSON.parse(utfEncodedResponse.replace(/(?:\\[rn]|[\r\n]|[-])/g, ''))['content'];
            const escapedText = escapeXmlCharacters(clearText);
            const ssml = `<speak><lang xml:lang="ru-RU">${escapedText}</lang></speak>`;
            console.debug('SSML data:', ssml);
            const Joke = await text2Speech(ssml);
            const attributesManager = handlerInput.attributesManager;
            let persistentAttributes = await attributesManager.getPersistentAttributes(true, {jokes: []});
            const numOfJokes = persistentAttributes.jokes.push(Joke);
            console.log('Just added joke #', numOfJokes);
            attributesManager.setPersistentAttributes(persistentAttributes);
            const RandomJoke = {
                nextJoke: persistentAttributes.jokes.length > 1 ?
                    getRandomJoke(persistentAttributes.jokes) :
                    (()=>{
                        console.log('First joke - audio probably not yet ready.');

                        return null;
                    })()
            };
            console.log('Random joke:', RandomJoke);
            attributesManager.setRequestAttributes(RandomJoke);
            attributesManager.savePersistentAttributes().then(() => console.log('Attributes persisted'),
                reason => console.error('Persist attributes failed', reason)).catch(console.error);

        } catch(error) {
            console.warn('New joke failed', error);
        }
    }
}

// The SkillBuilder acts as the entry point for your skill, routing all request and response
// payloads to the handlers above. Make sure any new handlers or interceptors you've
// defined are included below. The order matters - they're processed top to bottom.
exports.handler = Alexa.SkillBuilders.custom()
    .withPersistenceAdapter(
        new persistenceAdapter.S3PersistenceAdapter({bucketName:process.env.S3_PERSISTENCE_BUCKET})
    )
    .addRequestInterceptors(
        InitJokes
    )
    .addRequestHandlers(
        LaunchRequestHandler,
        HelpIntentHandler,
        CancelAndStopIntentHandler,
        SessionEndedRequestHandler,
        IntentReflectorHandler, // make sure IntentReflectorHandler is last so it doesn't override your custom intent handlers
        )
    .addErrorHandlers(
        ErrorHandler,
        )
    .lambda();
