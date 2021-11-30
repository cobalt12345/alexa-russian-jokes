const AWS = require('aws-sdk');

const s3SigV4Client = new AWS.S3({
    signatureVersion: 'v4'
});

module.exports.getS3PreSignedUrl = function getS3PreSignedUrl(s3ObjectKey) {

    const bucketName = process.env.S3_PERSISTENCE_BUCKET;
    const s3PreSignedUrl = s3SigV4Client.getSignedUrl('getObject', {
        Bucket: bucketName,
        Key: s3ObjectKey,
        Expires: 600000 //minutes
    });
    console.log(`Util.s3PreSignedUrl: ${s3PreSignedUrl} Object key: ${s3ObjectKey}`);

    return s3PreSignedUrl;

}