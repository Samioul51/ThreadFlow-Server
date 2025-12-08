import dotenv from 'dotenv';
import express from 'express';
import cors from 'cors';
import { MongoClient, ObjectId, ServerApiVersion } from 'mongodb';

dotenv.config();

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

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
    await client.connect();
    const db = client.db("ThreadFlow");
    const products = db.collection("products");

    // All products

    app.get("/products", async (req, res) => {
      try {
        const list = await products.find().sort({ date: -1 }).toArray();
        res.send({
          success: true,
          data: list
        });
      } catch(error){
        res.status(500).send({
          success:false,
          message:error.message
        })
      }
      
    });

    // Single Product

    app.get("/products/:id",async(req,res)=>{
      try{
        const id=req.params.id;
        const item=await products.findOne({_id:new ObjectId(id)});

        res.send({
          success:true,
          data:item
        });

      }catch(error){
        res.status(500).send({
          success:false,
          message:error.message
        })
      }
    });

    await client.db("admin").command({ ping: 1 });
    console.log("Pinged your deployment. You successfully connected to MongoDB!");
  } finally {
    // await client.close();
  }
}
run().catch(console.dir);

app.get('/', (req, res) => {
  res.send('Server running...')
})

app.listen(port, () => {
  console.log(`server running on ${port}`);
})
