import express from "express"
import { MongoClient, ObjectId } from 'mongodb';
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
const borrowCollection = db.collection("my-borrows");

//http://localhost:5000/add-book

app.get('/', (req, res)=>{
    res.send({message: 'Server is running fine!'})
})

app.listen(PORT, ()=>{
    console.log(`Server is running at ${PORT}`)
})

//book add
app.post('/add-book',async(req, res)=>{
  const data = req.body
 const result = await bookCollection.insertOne(data)
 console.log(result)
  res.send(result)
})

app.get('/book', async(req, res)=>{
  const category = req.query.category

  if (category) {
    const result = await bookCollection.find({ category: category }).toArray()
    res.send(result)
    return
  }

  const result = await bookCollection.find().toArray()
  res.send(result)
})

app.get('/categories', async(req, res)=>{
  const categories = await bookCollection.distinct('category')
  res.send(categories.sort())
})


//book details
app.get('/book/:id',async(req, res)=>{
  const {id} = req.params
  const result = await bookCollection.findOne({_id: new ObjectId(id)})
  res.send(result);
})


//book borrow
app.post("/my-borrows", async (req, res) => {
  const data = req.body;

  // Check if user already borrowed this book
  const alreadyBorrowed = await borrowCollection.findOne({
    bookId: data.bookId,
    userEmail: data.userEmail,
  });

  if (alreadyBorrowed) {
    return res.status(409).send({
      message: "You have already borrowed this book!",
    });
  }

  // Save borrow information
  const result = await borrowCollection.insertOne(data);

  console.log(result);

  res.send(result);
});

//my borrow book 
app.get('/my-borrows', async (req, res)=>{
  const email = req.query.email;
  const books = await borrowCollection.find({userEmail: email}).toArray();
  res.send(books)
})


//my books
app.get('/my-books', async(req, res)=>{
  const email = req.query.email;

  const result = await bookCollection.find({userEmail:email}).toArray();

  res.send(result)
})

//delete book
app.delete("/my-books/:id", async (req, res) => {
  const id = req.params.id;
  const email = req.query.email;

  const result = await bookCollection.deleteOne({
    _id: new ObjectId(id),
    userEmail: email,
  });

  res.send(result);
});


// Update My Book
app.put("/my-books/:id", async (req, res) => {
  const id = req.params.id;
  const email = req.query.email

  const result = await bookCollection.updateOne(
    {
       _id: new ObjectId(id),
      userEmail: email,
     },

    { 
      $set: req.body,
     }
  );

  res.send(result);
});
