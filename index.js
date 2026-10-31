import express from "express"
import { MongoClient } from 'mongodb';
import 'dotenv/config'
import cors from "cors"


const app = express()
app.use(cors())
app.use(express.json())
const PORT = 5000

const client = new MongoClient(process.env.MONGODB_URL);

export async function connectToMongoDB() {
  try {
    await client.connect();
    console.log("You successfully connected to MongoDB!");
    return client;
  } catch (err) {
    console.dir(err);
  }
}

const mongoClient = await connectToMongoDB();
const db = mongoClient.db("booknook")
const bookCollection = db.collection('book')

//http://localhost:5000/add-book

app.get('/', (req, res)=>{
    res.send({message: 'Server is running fine!'})
})

app.listen(PORT, ()=>{
    console.log(`Server is running at ${PORT}`)
})


app.post('/add-book',async(req, res)=>{
  const data = req.body
 const result = await bookCollection.insertOne(data)
 console.log(result)
  res.send(result)
})

app.get('/book', async(req, res)=>{
  const result = await bookCollection.find().toArray()
  res.send(result)
})