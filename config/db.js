const mongoose = require("mongoose")    

module.exports = () => {
    mongoose.connect("mongodb://localhost:27017/test-rms-db")
        .then(() => { console.log("database connected") })
        .catch((err) => { console.log(err) })
}
