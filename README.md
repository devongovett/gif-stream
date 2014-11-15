# gif-stream

A streaming GIF encoder and decoder for Node and the browser

## Installation

    npm install gif-stream

For the browser, you can build using [Browserify](http://browserify.org/).

## Decoding Example

This example uses the [concat-frames](https://github.com/devongovett/concat-frames)
module to collect the output of the GIF decoder into an array of frame objects.

```javascript
var GIFDecoder = require('gif-stream/decoder');
var concat = require('concat-frames');

// decode a GIF file to RGB pixels
fs.createReadStream('in.gif')
  .pipe(new GIFDecoder)
  .pipe(concat(function(frames) {
    // frames is an array of frame objects
    // each one has a `pixels` property containing
    // the raw RGB pixel data for that frame, as
    // well as the width, height, etc.
  }));
```

## Encoding Example

You can encode a GIF by writing or piping indexed/quantized data to a `GIFEncoder` stream.
If you write data to it manually, you need to first quantize the pixel data to produce a
color palette and a buffer of indexed pixels.  You can use the [neuquant](https://github.com/devongovett/neuquant)
module to do this.

Alternatively, if you have a stream of RGB data already, you can pipe it first to a neuquant 
stream, and then to a GIF encoder, which will do the hard work of quantizing and writing
indexed data for you.

```javascript
var GIFEncoder = require('gif-stream/encoder');
var neuquant = require('neuquant');

// encode an animated GIF file by writing pixels to it.
// you need to manually quantize the data to produce a palette and indexed pixels.
var enc = new GIFEncoder(width, height, { palette: paletteBuffer });
enc.pipe(fs.createWriteStream('out.gif'));

// frame1 and frame2 are buffers containing **indexed**
// pixel data, not RGB. more on that below.
enc.write(frame1);
enc.end(frame2);

// or, pipe data from another stream
// boom: streaming image transcoding!
RGBSource.pipe(new neuquant.Stream)
         .pipe(new GIFEncoder)
         .pipe(fs.createWriteStream('out.gif'));
```

## License

MIT
