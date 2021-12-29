// This sample demonstrates handling intents from an Alexa skill using the Alexa Skills Kit SDK (v2).
// Please visit https://alexa.design/cookbook for additional examples on implementing slots, dialog management,
// session persistence, api calls, and more.

'use strict';

const Alexa = require('ask-sdk-core');
const persistenceAdapter = require('ask-sdk-s3-persistence-adapter');
const {escapeXmlCharacters} = require("ask-sdk-core");
const {getS3PreSignedUrl, LocalizationInterceptor, getNewJoke} = require('./util');


const ContentType = {
    'ANECDOTES': 1,
    'APHORISMS': 4,
    'ADULTS': 11
}

const PersistAttributes = {
    jokes: {
        [ContentType.ANECDOTES]: [],
        [ContentType.APHORISMS]: [],
        [ContentType.ADULTS]: []
    },
    skillCalledFirstTime: true,
    //1 - anecdotes, 2 - aphorisms, 3 - adults content
    contentType: 1
};

const ChangeContentTypeHandler = {
    canHandle(handlerInput) {
        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
            && Alexa.getIntentName(handlerInput.requestEnvelope) === 'ChangeContentTypeIntent';
    },
    async handle(handlerInput) {
        const contentType = handlerInput.requestEnvelope.request.intent.slots.contentType.resolutions
            .resolutionsPerAuthority[0].values[0].value.id;

        console.debug('Set content type to ', contentType);

        if (contentType) {
            const persistentAttributes = await handlerInput.attributesManager.getPersistentAttributes(true,
                PersistAttributes);

            persistentAttributes.contentType = ContentType[contentType];
            handlerInput.attributesManager.setPersistentAttributes(persistentAttributes);
            handlerInput.attributesManager.savePersistentAttributes();


            const speech = handlerInput.t('MESSAGE_CHOSEN_CONTENT_TYPE',
                {contentType: handlerInput.t('CONTENT_TYPE_' + contentType)});

            return handlerInput.responseBuilder.speak(speech).withShouldEndSession(false).getResponse();
        }

    }
}

const LaunchRequestHandler = {
    THERE_ARE_NO_JOKES_YET: [],

    canHandle(handlerInput) {
        this.THERE_ARE_NO_JOKES_YET.push(handlerInput.t('ERROR_MSG_HUMOR_ISNT_STRONG'));
        this.THERE_ARE_NO_JOKES_YET.push(handlerInput.t('ERROR_MSG_TOO_SERIOUS'));
        this.THERE_ARE_NO_JOKES_YET.push(handlerInput.t('ERROR_MSG_DONT_KNOW_JOKES'));
        this.THERE_ARE_NO_JOKES_YET.push(handlerInput.t('ERROR_MSG_HA_HA_HA'));
        this.THERE_ARE_NO_JOKES_YET.push(handlerInput.t('ERROR_MSG_SERIOUS_RUSSIANS'));

        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'LaunchRequest';
    },

    async handle(handlerInput) {
        const persistentAttributes = await handlerInput.attributesManager.getPersistentAttributes(true,
            PersistAttributes);

        if (persistentAttributes.skillCalledFirstTime) {
            persistentAttributes.skillCalledFirstTime = false;
            handlerInput.attributesManager.setPersistentAttributes(persistentAttributes);
            handlerInput.attributesManager.savePersistentAttributes();

            const welcomeSpeach = handlerInput.t('MESSAGE_WELCOME');

            return handlerInput.responseBuilder.speak(welcomeSpeach).reprompt(welcomeSpeach)
                .withShouldEndSession(false).getResponse();

        } else {
            const reqAttributes = handlerInput.attributesManager.getRequestAttributes();
            console.log('Launch', reqAttributes);
            if (!reqAttributes || !(reqAttributes['nextJoke'])) {
                const noSelectedJoke = this.THERE_ARE_NO_JOKES_YET[getRandomInt(0, this.THERE_ARE_NO_JOKES_YET.length - 1)];

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

                return handlerInput.responseBuilder.speak(`<audio src="${escapedAudioUri}" />`)
                    .withShouldEndSession(false).getResponse();
            }
        }

    }
};

const NextJokeHandler = {
    canHandle(handlerInput) {
        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
            && Alexa.getIntentName(handlerInput.requestEnvelope) === 'NextJokeIntent';
    },
    handle(handlerInput) {
        return LaunchRequestHandler.handle(handlerInput);
    }
}

const HelpIntentHandler = {
    canHandle(handlerInput) {
        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
            && Alexa.getIntentName(handlerInput.requestEnvelope) === 'AMAZON.HelpIntent';
    },
    handle(handlerInput) {
        const speakOutput = handlerInput.t('MESSAGE_HELP');

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
        const speakOutput = handlerInput.t('MESSAGE_GOODBYE');
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
        const speakOutput = handlerInput.t('ERROR_MSG_TRY_LATER');

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

const InitJokes = {
    async process(handlerInput) {
        try {
            console.debug(JSON.stringify(handlerInput.requestEnvelope));
            const attributesManager = handlerInput.attributesManager;
            let persistentAttributes = await attributesManager.getPersistentAttributes(true, PersistAttributes);
            if (persistentAttributes.skillCalledFirstTime) {
                for (let contentType in ContentType) {
                    const contentTypeNum = ContentType[contentType];
                    var getNumOfJokes = 5;
                    console.log(`Get ${getNumOfJokes} jokes of kind ${contentType}(${contentTypeNum})`);
                    while (getNumOfJokes-- > 0) {
                        getNewJoke(persistentAttributes.jokes[contentTypeNum], contentTypeNum).then(() => {
                            attributesManager.setPersistentAttributes(persistentAttributes);
                            attributesManager.savePersistentAttributes().then(() => console.log('Attributes persisted'),
                                reason => console.error('Persist attributes failed', reason)).catch(console.error);
                        }).catch(console.warn);
                    }
                }
            } else {
                await getNewJoke(persistentAttributes.jokes[persistentAttributes.contentType],
                    persistentAttributes.contentType);

                attributesManager.setPersistentAttributes(persistentAttributes);
                attributesManager.savePersistentAttributes().then(() => console.log('Attributes persisted'),
                    reason => console.error('Persist attributes failed', reason)).catch(console.error);
            }


            const RandomJoke = {
                nextJoke: !persistentAttributes.skillCalledFirstTime
                    && persistentAttributes.jokes[persistentAttributes.contentType].length > 1 ?
                        getRandomJoke(persistentAttributes.jokes[persistentAttributes.contentType]) :
                            (()=>{
                                console.log('First joke - audio probably not yet ready.');

                                return null;
                            })()
            };
            console.log('Random joke:', RandomJoke);
            attributesManager.setRequestAttributes(RandomJoke);
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
        LocalizationInterceptor,
        InitJokes
    )
    .addRequestHandlers(
        LaunchRequestHandler,
        ChangeContentTypeHandler,
        HelpIntentHandler,
        NextJokeHandler,
        CancelAndStopIntentHandler,
        SessionEndedRequestHandler,
        IntentReflectorHandler, // make sure IntentReflectorHandler is last so it doesn't override your custom intent handlers
        )
    .addErrorHandlers(
        ErrorHandler,
        )
    .lambda();
