// const Jimp = require('jimp')
const path = require('path')
// const querystring = require('querystring')
const request = require('supertest')
const config = require(__dirname + '/../../config')
// const testManifest = require(path.resolve(
//   path.join(__dirname, 'visual_manifest.json')
// ))

const cdnUrl =
  'http://' + config.get('server.host') + ':' + config.get('server.port')
// const cdnClient = request(cdnUrl)
let app

// require('it-each')({ testPerIteration: true })

describe('Visual Regression', function() {
  this.timeout(15000)

  before(function(done) {
    delete require.cache[require.resolve(__dirname + '/../../dadi/lib/')]
    app = require(__dirname + '/../../dadi/lib/')

    app.start(function(err) {
      if (err) {
        return done()
      }

      // give it a moment for http.Server to finish starting
      setTimeout(function() {
        done()
      }, 500)
    })
  })

  after(function(done) {
    app.stop(done)
  })

  // it.each(testManifest.tests, 'Test', ['baselineFilename'], function (
  //   element,
  //   next
  // ) {
  //   requestTestImage(element)
  //     .then(() => {
  //       next()
  //     })
  //     .catch(err => {
  //       console.log(err)

  //       next(err)
  //     })
  // })
})

// function requestTestImage(test) {
//   const testFilePath = path.join(
//     test.recipeRoute || '',
//     testManifest.path,
//     test.image || ''
//   )
//   const outputPath = path.join(
//     __dirname,
//     '../',
//     test.baselineFilename.replace('baseline', 'failed')
//   )
//   const requestPath =
// test.url || '/' + testFilePath + '?' + querystring.encode(test.params)
//   const baselineImagePath = path.join(__dirname, '../', test.baselineFilename)

// return Jimp.read(baselineImagePath).then(baselineImage => {
// return Jimp.read(cdnUrl + requestPath).then(testImage => {
// const diff = Jimp.diff(baselineImage, testImage, 0.1) // threshold ranges 0-1 (default: 0.1)
// const distance = Jimp.distance(baselineImage, testImage) // perceived distance

//       if (distance < 0.15 || diff.percent < 0.15) {
//         return
//       }

//       const error = new Error(
//         `Image mismatch percentage: ${diff.percent *
//         100}. Saving diff image to ${outputPath}.`
//       )

//       diff.image.write(outputPath)

//       return Promise.reject(error)
//     })
//   })
// }
