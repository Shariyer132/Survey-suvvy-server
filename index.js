const express = require('express');
const app = express();
const cors = require('cors');
const jwt = require('jsonwebtoken');
require('dotenv').config();
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY)
const port = process.env.PORT || 5000;


const corsConfig = {
  origin: 'https://bistro-boss-restaurant-2b8a0.web.app',
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE']
}
app.use(cors(corsConfig))
app.options("*", cors(corsConfig))
app.use(express.json());

app.get('/', (req, res) => {
  res.send('boss is sitting')
})



const { MongoClient, ServerApiVersion, ObjectId, Timestamp } = require('mongodb');
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.fbkj2kv.mongodb.net/?retryWrites=true&w=majority`;

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

async function run() {
  try {
    const userCollections = client.db("surveySavvy").collection("users");
    const surveyCollections = client.db("surveySavvy").collection("surveys");
    const paymentUserCollections = client.db("surveySavvy").collection("payments");

    // jwt related api 
    app.post('/jwt', async (req, res) => {
      const user = req.body;
      const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, { expiresIn: '1h' });
      res.send({ token });
    })

    // middlewares
    const verifyToken = (req, res, next) => {
      if (!req.headers.authorization) {

        return res.status(401).send({ message: 'unauthorized access ' })
      }
      const token = req.headers.authorization.split(' ')[1];
      jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
        if (err) {
          return res.status(401).send({ message: 'unauthorized access' })
        }
        req.decoded = decoded;
        next()
      })
    }

    // use verify admin after verifyToken
    const verifyAdmin = async (req, res, next) => {
      const email = req?.decoded?.email?.email;
      console.log('from admin', req?.decoded?.email?.email);
      const query = { email: email };
      const user = await userCollections.findOne(query);
      const isAdmin = user?.role === 'admin';
      if (!isAdmin) {
        return res.status(403).send({ message: 'Forbidden access' })
      }
      next();
    }


    // users related api
    app.get('/users', verifyToken, async (req, res) => {
      const result = await userCollections.find().toArray();
      res.send(result)
    })
    app.post('/users', async (req, res) => {
      const user = req.body;
      const query = { email: user.email }
      const existingUser = await userCollections.findOne(query);
      if (existingUser) {
        return res.send({ message: 'user already exists', insertedId: null })
      }
      const result = await userCollections.insertOne(user);
      res.send(result);
    })

    app.get('/users/role/:email', verifyToken, async (req, res) => {
      const email = req.params.email;
      // console.log(email,"from token", req.decoded.email.email );
      if (email !== req.decoded.email.email) {
        return res.status(403).send({ message: 'forbidden access' })
      }
      const query = { email: email };
      const user = await userCollections.findOne(query);
      if (!user) {
        return res.status(404).send({ message: "user not found" })
      }
      res.send({ role: user.role });
    })

    app.patch('/users/role/:id', verifyToken, async (req, res) => {
      const id = req.params.id;
      const role = req.body.role;
      const filter = { _id: new ObjectId(id) }
      const updateDoc = {
        $set: {
          role: role
        }
      }
      const result = await userCollections.updateOne(filter, updateDoc)
      res.send(result);
    })

    app.delete('/users/:id', verifyToken, verifyAdmin, async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await userCollections.deleteOne(query);
      res.send(result);
    })

    // survey related api
    app.get('/surveys', async (req, res) => {
      const result = await surveyCollections.find().toArray();
      res.send(result)
    })

    app.post('/surveys', verifyToken, async (req, res) => {
      const user = { ...req.body, createdAt: new Date() }
      const result = await surveyCollections.insertOne(user);
      res.send(result);
    })

    app.patch('/surveys/:id', verifyToken, async (req, res) => {
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) }
      const { status, feedback, voteYes, voteNo, reason, reportedBy, commentText, voterEmail, voterName, voted, date, userId, likes, dislikes } = req.body;
      const updatedDoc = {
        $set: {},
        $push: {}
      }
      if (status) {
        updatedDoc.$set.status = status;
      }
      if (feedback) {
        updatedDoc.$set.feedback = feedback;
      }
      if (voteYes) {
        updatedDoc.$set.voteYes = voteYes;
      }
      if (voteNo) {
        updatedDoc.$set.voteNo = voteNo;
      }
      if (reason && reportedBy) {
        updatedDoc.$push.reports = { reason, reportedBy }
      }
      if (commentText) {
        updatedDoc.$push.comments = { text: commentText, userId }
      }
      if (likes) {
        updatedDoc.$set.likes = likes;
      }
      if (dislikes) {
        updatedDoc.$set.dislikes = dislikes;
      }
      if (voterName && voterEmail && voted && date) {
        updatedDoc.$push.voters = { voterEmail, voterName, voted, date }
      }

      const result = await surveyCollections.updateOne(filter, updatedDoc);
      res.send(result);

    })

    // payment intent
    app.post('/create-payment-intent', async (req, res) => {
      const { price } = req.body;
      const amount = parseInt(price * 100);

      const paymentIntent = await stripe.paymentIntents.create({
        amount: amount,
        currency: "usd",
        payment_method_types: ["card"],
      });

      res.send({
        clientSecret: paymentIntent.client_secret
      })
    })

    app.post('/payments', async (req, res) => {
      const payment = req.body;
      const paymentResult = await paymentUserCollections.insertOne(payment)
      res.send(paymentResult)
    })

    app.get('/payments', async (req, res) => {
      const result = await paymentUserCollections.find().toArray();
      res.send(result);
    })

  } finally {
  }
}
run().catch(console.dir);



app.listen(port, () => {
  console.log(`Bistro boss is running on port: ${port}`);
})