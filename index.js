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



function normalizeCategoryName(value) {
  if (typeof value !== "string") {
    return "";
  }

  return value.trim().replace(/\s+/g, " ");
}

function uniqueCategoryNames(values) {
  const categories = new Map();

  for (const value of values) {
    const name = normalizeCategoryName(value);

    if (!name) {
      continue;
    }

    const key = name.toLowerCase();
    const current = categories.get(key);

    if (
      !current ||
      (current === current.toLowerCase() && name !== name.toLowerCase())
    ) {
      categories.set(key, name);
    }
  }

  return [...categories.values()].sort((a, b) =>
    a.localeCompare(b, undefined, { sensitivity: "base" })
  );
}

async function getCategoryNames() {
  const values = await bookCollection.distinct("category");
  return uniqueCategoryNames(values);
}

async function resolveCategoryName(value) {
  const name = normalizeCategoryName(value);

  if (!name) {
    return "";
  }

  const categories = await getCategoryNames();
  const existing = categories.find(
    (category) => category.toLowerCase() === name.toLowerCase()
  );

  return existing ?? name;
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}


function categoryPattern(name) {
  const parts = normalizeCategoryName(name).split(" ").map(escapeRegex);
  return new RegExp(`^\\s*${parts.join("\\s+")}\\s*$`, "i");
}

//http://localhost:5000/add-book

app.get('/', (req, res)=>{
    res.send({message: 'Server is running fine!'})
})

app.listen(PORT, ()=>{
    console.log(`Server is running at ${PORT}`)
})

//book add
app.post('/add-book', async (req, res) => {
  try {
    const data = { ...req.body };
    const category = await resolveCategoryName(data.category);

    if (!category) {
      return res.status(400).send({
        message: "Category is required.",
      });
    }

    // The database generates _id; never store one supplied by the client.
    delete data._id;

    const result = await bookCollection.insertOne({
      ...data,
      category,
    });

    res.status(201).send(result);
  } catch (error) {
    console.error("Add book error:", error);
    res.status(500).send({
      message: "Failed to add book",
    });
  }
})

app.get('/book', async(req, res)=>{
  try {
    const category = req.query.category

    if (category) {

      // documents with "science " still appear under "Science".
      const result = await bookCollection.find({
        category: categoryPattern(String(category)),
      }).toArray()
      return res.send(result)
    }

    const result = await bookCollection.find().toArray()
    res.send(result)
  } catch (error) {
    console.error("Get books error:", error);
    res.status(500).send({
      message: "Failed to get books",
    })
  }
})

app.get('/categories', async(req, res)=>{
  try {
    const categories = await getCategoryNames()
    res.send(categories)
  } catch (error) {
    console.error("Get categories error:", error);
    res.status(500).send({
      message: "Failed to get categories",
    })
  }
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
  try {
    const { id } = req.params;
    const email = req.query.email;

    if (!ObjectId.isValid(id)) {
      return res.status(400).send({ message: "Invalid book id." });
    }

    if (!email) {
      return res.status(400).send({ message: "Email is required." });
    }

    // Only allow editable fields. In particular, never pass _id into $set:
    // MongoDB rejects updates to the immutable _id field.
    const allowedFields = [
      "bookName",
      "author",
      "category",
      "rating",
      "image",
      "description",
      "publishedYear",
      "availableCopies",
      "isNewArrival",
    ];

    const updates = {};

    for (const field of allowedFields) {
      if (req.body[field] !== undefined) {
        updates[field] = req.body[field];
      }
    }

    for (const field of ["bookName", "author", "image", "description"]) {
      if (updates[field] !== undefined) {
        if (typeof updates[field] !== "string") {
          return res.status(400).send({ message: `${field} must be text.` });
        }

        updates[field] = updates[field].trim();

        if (!updates[field]) {
          return res.status(400).send({ message: `${field} is required.` });
        }
      }
    }

    if (updates.category !== undefined) {
      const category = await resolveCategoryName(updates.category);

      if (!category) {
        return res.status(400).send({ message: "Category is required." });
      }

      updates.category = category;
    }

    if (updates.publishedYear !== undefined) {
      const year = Number(updates.publishedYear);

      if (
        !Number.isInteger(year) ||
        year < 1000 ||
        year > new Date().getFullYear()
      ) {
        return res.status(400).send({
          message: "Published year is not valid.",
        });
      }

      updates.publishedYear = year;
    }

    if (updates.rating !== undefined) {
      const rating = Number(updates.rating);

      if (!Number.isFinite(rating) || rating < 0 || rating > 5) {
        return res.status(400).send({
          message: "Rating must be between 0 and 5.",
        });
      }

      updates.rating = rating;
    }

    if (updates.availableCopies !== undefined) {
      const copies = Number(updates.availableCopies);

      if (!Number.isInteger(copies) || copies < 0) {
        return res.status(400).send({
          message: "Available copies must be a whole number.",
        });
      }

      updates.availableCopies = copies;
    }

    if (updates.isNewArrival !== undefined) {
      if (typeof updates.isNewArrival !== "boolean") {
        return res.status(400).send({
          message: "New arrival must be true or false.",
        });
      }
    }

    const result = await bookCollection.updateOne(
      {
        _id: new ObjectId(id),
        userEmail: email,
      },
      {
        $set: updates,
      }
    );

    if (result.matchedCount === 0) {
      return res.status(404).send({
        message: "Book not found or you do not own it.",
      });
    }

    const updatedBook = await bookCollection.findOne({
      _id: new ObjectId(id),
    });

    res.send({
      acknowledged: result.acknowledged,
      matchedCount: result.matchedCount,
      modifiedCount: result.modifiedCount,
      book: updatedBook,
    });
  } catch (error) {
    console.error("Update book error:", error);
    res.status(500).send({
      message: "Failed to update book",
    });
  }
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
