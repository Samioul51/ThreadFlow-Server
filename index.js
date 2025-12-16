import dotenv from 'dotenv';
import express from 'express';
import cors from 'cors';
import { MongoClient, ObjectId, ServerApiVersion } from 'mongodb';
import Stripe from 'stripe';
import rateLimit from 'express-rate-limit';
import admin from 'firebase-admin';

dotenv.config();

// Firebase Admin

const decoded = Buffer.from(process.env.FB_SERVICE_KEY, 'base64').toString('utf8')
const serviceAccount = JSON.parse(decoded);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const app = express();

const port = process.env.PORT || 3000;
const stripe = new Stripe(process.env.stripe_secret_key);


// Middlewares

app.set("trust proxy", 1);
app.use(cors());
app.use(express.json());

// FB token middleware

const verifyFirebaseToken = async (req, res, next) => {
  const authorization = req.headers.authorization;
  if (!authorization)
    return res.status(401).send({ message: "Unautorized access!" });

  const token = authorization.split(" ")[1];

  if (!token)
    return res.status(401).send({ message: "Unautorized access!" });

  try {
    req.user = await admin.auth().verifyIdToken(token);
    next();
  } catch (error) {
    return res.status(403).send({ message: "Forbidden!" });
  }
};

// Contact request limiter

const contactLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 1,
  message: {
    success: false,
    message: "Too many messages sent. Please try again later."
  },
  standardHeaders: true,
  legacyHeaders: false,
});

const uri = `mongodb+srv://${process.env.user_name}:${process.env.password}@cluster0.tugpfto.mongodb.net/?appName=Cluster0`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

async function run() {
  try {
    // await client.connect();
    const db = client.db("ThreadFlow");
    const products = db.collection("products");
    const orders = db.collection("orders");
    const users = db.collection("users");
    const contact = db.collection("contactForm");

    await users.createIndex({ email: 1 }, { unique: true });

    // Role verification middleware

    const verifyRole = (allowedRoles) => async (req, res, next) => {
      const dbUser = await users.findOne({ email: req.user.email });

      if (!dbUser || !allowedRoles.includes(dbUser.role))
        return res.status(403).send({ message: "Forbidden" });

      req.dbUser = dbUser;
      next();
    };

    // Storing User Info

    app.post("/users", async (req, res) => {
      try {
        const newUser = req.body;

        const existingUser = await users.findOne({ email: newUser.email });

        if (existingUser) {
          return res.send({
            success: true,
            data: existingUser,
          });
        }

        const result = await users.insertOne(newUser);
        const createdUser = await users.findOne({ _id: result.insertedId });

        res.send({
          success: true,
          data: newUser
        });
      } catch (error) {
        res.status(500).send({ success: false, message: error.message });
      }
    });

    // Getting user info

    app.get("/users/:email", verifyFirebaseToken, verifyRole(["admin", "buyer", "manager"]), async (req, res) => {
      try {
        const email = req.params.email;
        const user = await users.findOne({ email });

        if (user.email !== req.user.email)
          return res.status(403).send({ message: "Forbidden" });

        if (!user) {
          return res.status(404).send({
            success: false,
            message: "User not found"
          });
        }

        res.send({
          success: true,
          data: user
        });
      } catch (error) {
        res.status(500).send({
          success: false,
          message: error.message
        });
      }
    });

    // All users

    app.get("/users", verifyFirebaseToken, verifyRole(["admin"]), async (req, res) => {
      try {
        const allUsers = await users.find().toArray();
        res.send({
          success: true,
          data: allUsers
        })
      } catch (error) {
        res.status(500).send({
          success: false,
          message: error.message
        });
      }
    });

    // Update User

    app.patch("/users/:id", verifyFirebaseToken, verifyRole(["admin"]), async (req, res) => {
      try {
        const id = req.params.id;
        const { roleStatus, feedback } = req.body;

        if (!roleStatus) {
          return res.status(400).send({
            success: false,
            message: "roleStatus is required"
          });
        }

        const updatedFields = { roleStatus };

        if (roleStatus === "suspended") {
          if (!feedback) {
            return res.status(400).send({
              success: false,
              message: "Feedback is required"
            });
          }
          updatedFields.feedback = feedback;
        }
        else
          updatedFields.feedback = "";

        const result = await users.updateOne(
          {
            _id: new ObjectId(id)
          },
          {
            $set: updatedFields
          }
        );

        if (result.matchedCount === 0) {
          return res.status(404).send({
            success: false,
            message: "No user found or no changes made!"
          })
        }

        res.send({
          success: true,
          message: "User updated successfully!",
        })

      } catch (error) {
        res.status(500).send({
          success: false,
          message: error.message
        })
      }
    });

    // All products

    app.get("/products", async (req, res) => {
      try {
        const { limit = 0, skip = 0, category, search } = req.query;

        const filter = {};

        if (category && category !== "All")
          filter.category = category;

        if (search)
          filter.productName = { $regex: search, $options: "i" };

        const total = await products.countDocuments(filter);

        const list = await products.find(filter).sort({ availableQuantity: -1 }).limit(Number(limit)).skip(Number(skip)).toArray();
        res.send({
          success: true,
          total,
          data: list
        });
      } catch (error) {
        res.status(500).send({
          success: false,
          message: error.message
        })
      }

    });

    // Homepage products selection

    app.patch("/products/:id/toggle-home", verifyFirebaseToken, verifyRole(["admin"]), async (req, res) => {
      try {
        const id = req.params.id;
        const { showOnHome } = req.body;

        const result = await products.updateOne(
          { _id: new ObjectId(id) },
          { $set: { showOnHome: showOnHome } }
        );

        if (result.modifiedCount === 0) {
          return res.status(404).send({
            success: false,
            message: "No product found or no changes made!"
          });
        }

        res.send({
          success: true,
          message: "Product toggling for homepage done successfully"
        });

      } catch (error) {
        res.status(500).send({
          success: false,
          message: error.message
        });
      }
    });

    // Homepage limit 6 products

    app.get("/products/home", async (req, res) => {
      try {
        const homeProducts = await products.find({ showOnHome: true }).sort({ availableQuantity: -1 }).limit(6).toArray();

        res.send({
          success: true,
          data: homeProducts
        });
      } catch (error) {
        res.status(500).send({
          success: false,
          message: error.message
        });
      }
    });

    // New Product add

    app.post("/products", verifyFirebaseToken, verifyRole(["manager"]), async (req, res) => {
      try {
        const newProduct = { ...req.body, email: req.user.email };
        const result = await products.insertOne(newProduct);
        res.send(result);
      } catch (error) {
        res.status(500).send({ success: false, message: error.message });
      }
    });


    // Single Product

    app.get("/products/:id", async (req, res) => {
      try {
        const id = req.params.id;
        const item = await products.findOne({ _id: new ObjectId(id) });

        res.send({
          success: true,
          data: item
        });

      } catch (error) {
        res.status(500).send({
          success: false,
          message: error.message
        })
      }
    });

    // Update Product

    app.patch("/products/:id", verifyFirebaseToken, verifyRole(["admin", "manager"]), async (req, res) => {
      try {
        const id = req.params.id;

        const product = await products.findOne({ _id: new ObjectId(id), email: req.user.email });

        if (req.dbUser?.role === "manager" && !product)
          return res.status(403).send({ message: "Forbidden" });

        const { productName, category, price, newQuantity, images, minimumOrderQuantity, paymentOptions, productDescription } = req.body;

        const updatedFields = {};

        if (price !== undefined)
          updatedFields.price = price;
        if (newQuantity !== undefined)
          updatedFields.availableQuantity = newQuantity;
        if (minimumOrderQuantity !== undefined)
          updatedFields.minimumOrderQuantity = minimumOrderQuantity;
        if (paymentOptions !== undefined)
          updatedFields.paymentOptions = paymentOptions;
        if (productDescription !== undefined)
          updatedFields.productDescription = productDescription;
        if (productName !== undefined)
          updatedFields.productName = productName;
        if (category !== undefined)
          updatedFields.category = category;
        if (images !== undefined)
          updatedFields.images = images;

        const result = await products.updateOne(
          {
            _id: new ObjectId(id)
          },
          {
            $set: updatedFields
          }
        );

        if (result.modifiedCount === 0) {
          return res.status(404).send({
            success: false,
            message: "No product found or no changes made!"
          })
        }

        res.send({
          success: true,
          message: "Product updated successfully!",
        })

      } catch (error) {
        res.status(500).send({
          success: false,
          message: error.message
        })
      }
    });

    // Product availableQuantity update after buying

    app.patch("/products/:id/stock", verifyFirebaseToken, async (req, res) => {
      try {
        const { quantitySold } = req.body;
        const id = req.params.id;

        if (!quantitySold || quantitySold <= 0)
          return res.status(400).send({ success: false, message: "Missing newQuantity" });

        const result = await products.updateOne(
          { _id: new ObjectId(id) },
          { $inc: { availableQuantity: -quantitySold } }
        );

        if (result.modifiedCount === 0)
          return res.status(404).send({ success: false, message: "Product not found or no changes made" });

        res.send({ success: true, message: "Stock updated successfully" });
      } catch (error) {
        res.status(500).send({ success: false, message: error.message });
      }
    });


    // Delete Product

    app.delete("/products/:id", verifyFirebaseToken, verifyRole(["admin", "manager"]), async (req, res) => {
      try {
        const id = req.params.id;
        const product = await products.findOne({ _id: new ObjectId(id), email: req.user.email });

        if (req.dbUser?.role === "manager" && !product)
          return res.status(403).send({ message: "Forbidden" });

        const query = { _id: new ObjectId(id) }
        const result = await products.deleteOne(query);
        res.send(result);
      } catch (error) {
        res.status(500).send({ success: false, message: error.message });
      }
    });

    // All Orders

    app.get("/orders", verifyFirebaseToken, verifyRole(["admin", "manager", "buyer"]), async (req, res) => {
      try {
        let query = {};

        if (req.dbUser.role === "manager")
          query.sellerEmail = req.user.email;

        if (req.dbUser.role === "buyer")
          query.email = req.user.email;

        const list = await orders.find(query).sort({ createdAt: -1 }).toArray();
        res.send({
          success: true,
          data: list
        });
      } catch (error) {
        res.status(500).send({
          success: false,
          message: error.message
        })
      }

    });

    // Stripe

    app.post("/create-payment-intent", verifyFirebaseToken, async (req, res) => {
      try {
        const { amount } = req.body;

        const paymentIntent = await stripe.paymentIntents.create({
          amount: amount * 100,
          currency: "usd",
          automatic_payment_methods: { enabled: true }
        });

        res.send({
          clientSecret: paymentIntent.client_secret
        });

      } catch (error) {
        res.status(500).send({ success: false, message: error.message })
      }
    });

    // New Order add

    app.post("/orders", verifyFirebaseToken, verifyRole(["buyer"]), async (req, res) => {
      try {
        const newOrder = { ...req.body, email: req.user.email };
        const result = await orders.insertOne(newOrder);
        res.send(result);
      } catch (error) {
        res.status(500).send({ success: false, message: error.message });
      }
    });

    // Delete orders

    app.delete("/orders/:id", verifyFirebaseToken, verifyRole(["buyer"]), async (req, res) => {
      try {
        const id = req.params.id;

        const order = await orders.findOne({ _id: new ObjectId(id) });

        if (!order)
          return res.status(404).send({ message: "Order not found" });

        if (req.dbUser.role === "buyer" && order.email !== req.user.email)
          return res.status(403).send({ message: "Forbidden" });

        if (order.deliveryStatus !== "pending" || order.paymentStatus !== "pending")
          return res.status(400).send({ message: "Order cannot be cancelled" });

        await products.updateOne(
          { _id: new ObjectId(order.productID) },
          { $inc: { availableQuantity: Number(order.quantity) } }
        );

        const query = { _id: new ObjectId(id) }
        const result = await orders.deleteOne(query);
        res.send(result);
      } catch (error) {
        res.status(500).send({ success: false, message: error.message });
      }
    });

    // Single order

    app.get("/orders/:id", verifyFirebaseToken, async (req, res) => {
      try {
        const id = req.params.id;
        const item = await orders.findOne({ _id: new ObjectId(id) });

        if (req.dbUser?.role === "buyer" && item.email !== req.user.email)
          return res.status(403).send({ message: "Forbidden" });

        if (req.dbUser?.role === "manager" && item.sellerEmail !== req.user.email)
          return res.status(403).send({ message: "Forbidden" });

        res.send({
          success: true,
          data: item
        });

      } catch (error) {
        res.status(500).send({
          success: false,
          message: error.message
        })
      }
    });

    // Order Update

    app.patch("/orders/:id", verifyFirebaseToken, verifyRole(["admin", "manager"]), async (req, res) => {
      try {
        const id = req.params.id;
        const { statusKey, location } = req.body;

        if (!statusKey) {
          return res.status(400).send({
            success: false,
            message: "Status key required"
          })
        }

        const order = await orders.findOne({ _id: new ObjectId(id) });

        if (!order)
          return res.status(404).send({ message: "Order not found" });

        if (statusKey === "rejected")
          await products.updateOne(
            { _id: new ObjectId(order.productID) },
            { $inc: { availableQuantity: Number(order.quantity) } }
          );


        const updateQuery = {
          deliveryStatus: statusKey,
          [`productionStatus.${statusKey}`]: {
            date: new Date(),
            location
          },
          ...(statusKey === "shipped" && { paymentStatus: "paid" })
        };

        const result = await orders.updateOne(
          { _id: new ObjectId(id) },
          { $set: updateQuery }
        );

        res.send({
          success: true,
          message: "Order status updated successfully!",
        })

      } catch (error) {
        res.status(500).send({
          success: false,
          message: error.message
        })
      }
    });

    // Contact Form

    app.post("/contact", contactLimiter, async (req, res) => {
      try {
        const newMessage = req.body;
        const result = await contact.insertOne(newMessage);
        res.send(result);
      } catch (error) {
        res.status(500).send({ success: false, message: error.message });
      }
    });


    // await client.db("admin").command({ ping: 1 });
    // console.log("Pinged your deployment. You successfully connected to MongoDB!");
  } finally {
    // await client.close();
  }

}
run().catch(console.dir);

app.get('/', (req, res) => {
  res.send('Server running...')
})

// app.listen(port, () => {
//   console.log(`server running on ${port}`);
// })


