import express from "express"


const app = express()
const PORT = 5000

//http://localhost:5000

app.get('/', (req, res)=>{
    res.send({message: 'Server is running fine!'})
})

app.listen(PORT, ()=>{
    console.log(`Server is running at ${PORT}`)
})