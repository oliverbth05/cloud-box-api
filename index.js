const path = require('path');
const fs = require('fs');
const uniqid = require('uniqid');
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const multer = require('multer');
const morgan = require('morgan'); 

const app = express();

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, path.join(__dirname, '/uploads'))
  },
  filename: function (req, file, cb) {
    cb(null, file.originalname)
  },
  onError : function(err, next) {
    console.log('error', err);
    next(err);
  }
}) 
 
const upload = multer({ storage })
app.use(morgan('tiny'));
app.use(cors());
app.use(bodyParser.json());

app.get('/download/:id', (req, res) => {
  try {
    const manifestData = JSON.parse(fs.readFileSync(path.join(__dirname, 'uploadManifest.json')));
    const searchFile = manifestData.filter(file => file.id === req.params.id)[0];
    if (!searchFile) {
      throw new Error(503);
    }
    res.download(searchFile.path);
  }
  
  catch (err) {
    res.status(503).json();
  }
})

app.delete('/download/:id', (req, res) => {
  try {
    const manifestData = JSON.parse(fs.readFileSync(path.join(__dirname, 'uploadManifest.json')));
    const usageData = JSON.parse(fs.readFileSync(path.join(__dirname, 'quota.json')));
    
    const toDelete = manifestData.filter(file => file.id === req.params.id)[0];
    
    if (!toDelete) throw new Error();
    
    const updated = manifestData.filter(file => file.id !== req.params.id);
    usageData.used -= toDelete.size
    fs.writeFileSync(path.join(__dirname, 'uploadManifest.json'), JSON.stringify(updated));
    fs.writeFileSync(path.join(__dirname, 'quota.json'), JSON.stringify(usageData));
    fs.unlinkSync(toDelete.path);
    res.status(200).json();
  }
  catch(err) {
    res.status(503).json()
  }
})

app.get('/files', (req, res) => {
  try {
    const files = JSON.parse(fs.readFileSync(path.join(__dirname, 'uploadManifest.json')));
    const usageData = JSON.parse(fs.readFileSync(path.join(__dirname, 'quota.json')));
    res.json({files, usageData});
  }
  
  catch(err) {
    res.status(503).json()
  }
})

app.post('/new', upload.single('file'), (req, res, err) => {
  try {
    const manifestData = JSON.parse(fs.readFileSync(path.join(__dirname, 'uploadManifest.json')));
    const usageData = JSON.parse(fs.readFileSync(path.join(__dirname, 'quota.json')));
    
    if (usageData.used + req.file.size > usageData.quota) {
      throw new Error(400)
    }
    
    else {
      const newFile = {
        id: uniqid(),
        fileName: req.file.filename,
        size: req.file.size,
        path: req.file.path,
        fileType: path.extname(req.file.path),
        dateUploaded: Date.now()
      }
    
      manifestData.push(newFile);
      usageData.used += req.file.size;
    
      fs.writeFileSync(path.join(__dirname, 'uploadManifest.json'), JSON.stringify(manifestData))
      fs.writeFileSync(path.join(__dirname, 'quota.json'), JSON.stringify(usageData))
      res.json(newFile);
    }
  }
  
  catch(err) {
    console.log(err.message)
    if (err.message === '400') {
      res.status(400).json()
    }
    
    else {
      res.status(503).json()
    }
  }
   
})

const checkManifest = () => {
  const uploadManifest = JSON.parse(fs.readFileSync(path.join(__dirname, 'uploadManifest.json')))
  const usageData = JSON.parse(fs.readFileSync(path.join(__dirname, 'quota.json')))
  
  if (uploadManifest.length === 0) {
    
    if (usageData.used !==0) {
      usageData.used = 0;
      fs.writeFileSync(path.join(__dirname, 'quota.json'), JSON.stringify(usageData));
      return
    }
    
    return
  }
  
  for (var i = 0; i < uploadManifest.length; i++) {
    if (!fs.existsSync(uploadManifest[i].path)) {
      
      usageData.used -= uploadManifest[i].size
      uploadManifest.splice(i, 1);
    }
  }
  
  fs.writeFileSync(path.join(__dirname, 'uploadManifest.json'), JSON.stringify(uploadManifest))
  fs.writeFileSync(path.join(__dirname, 'quota.json'), JSON.stringify(usageData))
}

setInterval(checkManifest, 10000);

app.listen(process.env.PORT, () => {
  console.log('Listening')
})