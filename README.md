# Whole application description

Current application is a 'Russian Jokes' Alexa skill, which tells the user jokes in Russian language.<br/>
Jokes are taken from third party external service via simple HTTP GET method returning a simple JSON object containing a joke text.
Then text is transformed to speech using the Amazon Polly service. Resulting MP3 is placed to the S3
bucket.<br/>
Finally alexa plays MP3 using the SSML (Speech Synthesis Markup Language) &lt;audio/&gt; tag.
## Application Architecture

![Alexa Skill Design](https://github.com/cobalt12345/alexa-russian-jokes/blob/09139641d2f68ee2e8f85d0344d8f771830f0134/alexa-skill-design.png)

## See how it works
"Anecdotes and Aphorisms" Alice skill in <a href="">Yandex catalogue</a>.
