import json
from datetime import datetime, timedelta

def parse_time(time_str):
    """
    Parses the time string from the log into a datetime object.
    Matches the format in your .logs file: "YYYY-MM-DD HH:MM:SS.mmmmmm"
    """
    try:
        return datetime.strptime(time_str, "%Y-%m-%d %H:%M:%S.%f")
    except ValueError:
        # Fallback just in case some lines don't have microseconds
        return datetime.strptime(time_str, "%Y-%m-%d %H:%M:%S")

def process_logs(input_file, output_file):
    parsed_logs = []

    # 1. Read and parse logs
    print(f"Reading logs from {input_file}...")
    try:
        with open(input_file, "r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if not line:
                    continue
                
                try:
                    # Attempt to parse the JSON string
                    log_entry = json.loads(line)
                    
                    if "time" in log_entry:
                        log_time = parse_time(log_entry["time"])
                        # Store as a tuple: (datetime_object, original_dictionary)
                        parsed_logs.append((log_time, log_entry))
                except json.JSONDecodeError:
                    # Gracefully skip malformed JSON (like the cut-off line at the end of your file)
                    continue
    except FileNotFoundError:
        print(f"Error: Could not find {input_file}")
        return

    if not parsed_logs:
        print("No valid logs found to process.")
        return

    # 2. Sort logs chronologically 
    # (Sorting by the first element of the tuple, which is the datetime object)
    parsed_logs.sort(key=lambda x: x[0])

    grouped_logs = {}
    window_counter = 1
    
    # Initialize the first 60-second window
    current_window_start = parsed_logs[0][0]
    current_window_end = current_window_start + timedelta(seconds=60)
    current_window_logs = []

    # 3. Group logs into 60-second windows
    for log_time, log_entry in parsed_logs:
        if log_time < current_window_end:
            # Still within the current 60-second window
            current_window_logs.append(log_entry)
        else:
            # Window is full, save it to the main dictionary
            grouped_logs[f"window_{window_counter}"] = {
                "start_time": str(current_window_start),
                "end_time": str(current_window_end),
                "logs": current_window_logs
            }
            
            # Start the next window exactly at this new log's timestamp
            window_counter += 1
            current_window_start = log_time
            current_window_end = current_window_start + timedelta(seconds=60)
            current_window_logs = [log_entry]

    # Save the final pending window if it has any logs left over
    if current_window_logs:
        grouped_logs[f"window_{window_counter}"] = {
            "logs": current_window_logs
        }

    # 4. Save to JSON
    with open(output_file, "w", encoding="utf-8") as out_file:
        json.dump(grouped_logs, out_file, indent=4)

    # 5. Print summary metrics
    print("\n--- Processing Complete ---")
    print(f"Total number of windows created: {len(grouped_logs)}")
    for window_key, window_data in grouped_logs.items():
        print(f"{window_key}: {len(window_data['logs'])} logs")




if __name__ == "__main__":
    # Pointing to your specific file extension
    INPUT_FILENAME = "lol.logs"       # Change this to the exact name of your .logs file
    OUTPUT_FILENAME = "grouped_logs.json"
    
    process_logs(INPUT_FILENAME, OUTPUT_FILENAME)