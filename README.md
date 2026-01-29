# All-in-One Benchmark & Agent System

This project combines a 3D simulation benchmark, a LangGraph-based ROS2 agent, and analysis tools.

## Prerequisites
- **ROS2** (Robot Operating System 2)
- Python 3.10+ (Recommended `conda create -n ros2 python=3.10`)
conda env create -f ~/env.yml  
conda activate ros2     


## Usage

### 1. Start Benchmark Simulator
The simulator interacts with the agent via ROS2 topics (`/scene_graph`, `/task_cmd`, etc.).
```bash
cd 3Ddesk
./start.sh
```
*Open `http://localhost:8000` in your browser.*

### 2. Configure & Start Agent
1. **API Key**: Edit `langgraph_agent/config.py` to set your LLM API key (`api_key` and `base_url`).
2. **Start Agent**:
   ```bash
   conda activate ros2
   cd langgraph_agent
   python start_agent.py
   ```

### 3. Start Automatic Testing
Launch the test publisher to send predefined tasks to the simulator and agent.
```bash
conda activate ros2
cd 3Ddesk
python test_user_cmd_pub.py
```
*The agent will automatically plan, execute tasks, and save reports to `langgraph_agent/agent_report/`. But you need to manually click the "start" button in the frontend website to make the simulator execute the task.*

### 4. Evaluate Reports
Batch-process all agent reports to determine task success (Success/Failure/Rule Error).
```bash
cd report_analysis
python Auto_extract_report_data_batch.py --report_dir ../langgraph_agent/agent_report --output-dir ./results
```

### 5. Analyze Success Rate
Generate detailed statistics on success rates and sub-goal progress (4-way classification).
```bash
# Ensure log path in script matches your output (default is processed log from step 4)
cd report_analysis
python analyze_success_rate.py
```
