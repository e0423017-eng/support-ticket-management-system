require("dotenv").config()  
const express = require("express")
const connectDB = require("./config/db")
const userApi = require("./api/userApi")
const app = express()
app.use(express.json())
connectDB()

app.use("/users", userApi)


app.listen(process.env.PORT, () => {
    console.log("server is running on 3000")
})