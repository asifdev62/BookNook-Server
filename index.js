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
const userCollection = db.collection("user");

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
  try {
    const data = req.body;

    const alreadyBorrowed = await borrowCollection.findOne({
      bookId: data.bookId,
      userEmail: data.userEmail,
      returned: { $ne: true },
    });

    if (alreadyBorrowed) {
      return res.status(409).send({
        message: "You have already borrowed this book!",
      });
    }

    const book = await bookCollection.findOne({
      _id: new ObjectId(data.bookId),
    });

    if (!book) {
      return res.status(404).send({
        message: "Book not found!",
      });
    }

    if (book.availableCopies <= 0) {
      return res.status(400).send({
        message: "No copies available!",
      });
    }

    const updateBook = await bookCollection.updateOne(
      {
        _id: new ObjectId(data.bookId),
        availableCopies: { $gt: 0 },
      },
      {
        $inc: { availableCopies: -1 },
      }
    );

    if (updateBook.modifiedCount === 0) {
      return res.status(400).send({
        message: "No copies available!",
      });
    }

    const borrowData = {
      ...data,
      borrowDate: data.borrowDate || new Date().toISOString(),
      returnDate: null,
      returned: false,
      active: true,
    };

    const result = await borrowCollection.insertOne(borrowData);

    res.send({
      message: "Book borrowed successfully!",
      insertedId: result.insertedId,
    });
  } catch (error) {
    console.error("Borrow error:", error);
    res.status(500).send({
      message: "Failed to borrow book",
    });
  }
});


// My active borrowed books
app.get("/my-borrows", async (req, res) => {
  try {
    const email = req.query.email;

    const books = await borrowCollection
      .find({
        userEmail: email,
        returned: { $ne: true },
      })
      .sort({ borrowDate: -1 })
      .toArray();

    res.send(books);
  } catch (error) {
    console.error("My borrows error:", error);
    res.status(500).send({
      message: "Failed to get borrowed books",
    });
  }
});

// Return borrowed book
app.put("/my-borrows/:id/return", async (req, res) => {
  try {
    const id = req.params.id;
    const { email } = req.body;

    const borrow = await borrowCollection.findOne({
      _id: new ObjectId(id),
      userEmail: email,
      returned: { $ne: true },
    });

    if (!borrow) {
      return res.status(404).send({
        message: "Borrowed book not found!",
      });
    }

    const result = await borrowCollection.updateOne(
      {
        _id: new ObjectId(id),
        userEmail: email,
        returned: { $ne: true },
      },
      {
        $set: {
          returned: true,
          active: false,
          returnDate: new Date().toISOString(),
        },
      }
    );

    if (result.modifiedCount === 0) {
      return res.status(400).send({
        message: "Book could not be returned!",
      });
    }

    await bookCollection.updateOne(
      { _id: new ObjectId(borrow.bookId) },
      {
        $inc: { availableCopies: 1 },
      }
    );

    res.send({
      message: "Book returned successfully!",
    });
  } catch (error) {
    console.error("Return book error:", error);
    res.status(500).send({
      message: "Failed to return book",
    });
  }
});

// Borrowed books count
app.get("/borrowed-count", async (req, res) => {
  try {
    const email = req.query.email;

    const count = await borrowCollection.countDocuments({
      userEmail: email,
      returned: { $ne: true },
    });

    res.send({ count });
  } catch (error) {
    console.error("Borrowed count error:", error);
    res.status(500).send({
      message: "Failed to get borrowed count",
    });
  }
});


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

//user profile
app.get('/user-profile', async(req, res)=>{
  const email = req.query.email;

  const result = await userCollection.findOne({email:email})

  res.send(result)
})

//update profile
app.put("/user-profile", async (req, res) => {
  const email = req.query.email;
  const { name, image, phone } = req.body;

  const result = await userCollection.updateOne(
    { email: email },
    {
      $set: {
        name: name,
        image: image,
        phone: phone,
      },
    }
  );

  res.send(result);
});



app.get("/popular-books", async (req, res) => {
  const result = await bookCollection
    .find()
    .sort({ rating: -1 })
    .limit(8)
    .toArray();

  res.send(result);
});
