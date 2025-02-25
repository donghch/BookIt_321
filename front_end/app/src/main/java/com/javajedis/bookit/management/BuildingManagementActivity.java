package com.javajedis.bookit.management;

import android.content.Intent;
import android.os.Bundle;
import android.util.Log;
import android.view.View;
import android.widget.Button;
import android.widget.TextView;
import android.widget.Toast;

import androidx.annotation.Nullable;
import androidx.appcompat.app.AppCompatActivity;
import androidx.recyclerview.widget.LinearLayoutManager;
import androidx.recyclerview.widget.RecyclerView;

import com.google.android.gms.auth.api.signin.GoogleSignIn;
import com.google.android.gms.auth.api.signin.GoogleSignInAccount;
import com.javajedis.bookit.MainActivity;
import com.javajedis.bookit.R;
import com.javajedis.bookit.recyclerView.RecyclerViewInterface;
import com.javajedis.bookit.recyclerView.adapter.Building_Selection_RecyclerViewAdapter;
import com.javajedis.bookit.util.Authentication;
import com.javajedis.bookit.util.Constant;
import com.javajedis.bookit.util.ServerRequests;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.io.IOException;
import java.util.ArrayList;
import java.util.Objects;

import okhttp3.Call;
import okhttp3.Callback;
import okhttp3.OkHttpClient;
import okhttp3.Request;
import okhttp3.Response;

public class BuildingManagementActivity extends AppCompatActivity implements RecyclerViewInterface {
    private final String TAG = "BuildingManagementActivity";
    private final ArrayList<String> managedBuildings = new ArrayList<>();

    private Building_Selection_RecyclerViewAdapter adapter;

    private String selectedBuilding;

    private String adminEmail;

    private TextView adminHeading;

    protected void onCreate(@Nullable Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_building_management);

        adminHeading = findViewById(R.id.admin_info_textView);

        adminEmail = getIntent().getStringExtra("AdminEmail");

//        GoogleSignInAccount account = GoogleSignIn.getLastSignedInAccount(BuildingManagementActivity.this);
//
//        assert account != null;

        adminHeading.setText(adminEmail);

        initAdminBuildings();

        checkUserIdentityAndSetView();
    }

    @Override
    public void onItemClick(int position) {
        selectedBuilding = adapter.getSelected();
    }

    private void initAdminBuildings() {
        OkHttpClient client = new OkHttpClient();
        String url = Constant.DOMAIN + "/user/admin/" + adminEmail + "/buildings";

        Request request = new Request.Builder().url(url).get().build();

        client.newCall(request).enqueue(new Callback() {
            @Override
            public void onFailure(Call call, IOException e) {
                e.printStackTrace();
                Log.e("AdminManagement", "Get request failed: " + e.getMessage());
            }
            @Override
            public void onResponse(Call call, Response response) throws IOException {
                if (response.isSuccessful()) {
                    try {
                        assert response.body() != null;
                        String jsonResponse = response.body().string();
                        // parse
                        JSONObject responseObject = new JSONObject(jsonResponse);
                        JSONArray data = responseObject.getJSONArray("data");
                        String managedBuilding = data.toString();
                        runOnUiThread(new Runnable() {
                            @Override
                            public void run() {
                                try {
                                    initData(managedBuilding);
                                    adapter = new Building_Selection_RecyclerViewAdapter(BuildingManagementActivity.this, managedBuildings, BuildingManagementActivity.this);
                                    RecyclerView recyclerView = findViewById(R.id.building_management_recyclerView);
                                    recyclerView.setAdapter(adapter);
                                    recyclerView.setLayoutManager(new LinearLayoutManager(BuildingManagementActivity.this));
                                } catch (JSONException e) {
                                    Log.e(TAG, "Error setting locations for admin management Buildings");
                                }
                            }
                        });
                    } catch (IOException | JSONException e) {
                        Log.e(TAG, "Error reading response: " + e.getMessage());
                    }
                } else {
                    Log.e(TAG, "Response is not successful");
                    assert response.body() != null;
                    System.out.println(response.body().toString());
                }
            }
        });
    }

    private void initData (String data) throws JSONException{

        JSONArray jsonArray = new JSONArray(data);
        for (int i = 0; i < jsonArray.length(); i++) {
            JSONObject object = jsonArray.getJSONObject(i);
            String buildingCode = object.toString();
            managedBuildings.add(buildingCode);
        }
    }

    private void checkUserIdentityAndSetView() {
        OkHttpClient client = new OkHttpClient();
        String userToken = Authentication.getCurrentAccountToken(BuildingManagementActivity.this);
        String getUrl = Constant.DOMAIN + "/user/type/?token=" + userToken;

        Request request = new Request.Builder().url(getUrl).get().build();

        client.newCall(request).enqueue(new Callback() {
            @Override
            public void onFailure(Call call, IOException e) {
                Log.e(TAG, "GET request failed: " + e.getMessage());
                e.printStackTrace();
            }

            @Override
            public void onResponse(Call call, Response response) throws IOException {
                if (response.isSuccessful()) {
                    assert response.body() != null;
                    String responseBody = response.body().string();
                    System.out.println(responseBody);
                    // You can parse and process the response data as needed

                    // TODO get info from responseBody and show correct view
                    String currentUserType = getIntent().getStringExtra("userType");
                    if (Objects.equals(currentUserType, "admin")) {
                        showAdminView();
                    } else if (Objects.equals(currentUserType, "superadmin")) {
                        showSuperAdminView();
                    } else if (Objects.equals(currentUserType, "user")) {
                        Log.e (TAG, "Error, normal user shouldn't be able to see this page: " + responseBody);
                    } else {
                        Log.e(TAG, "Error: unknown user type : " + responseBody);
                    }
                } else {
                    Log.e(TAG, "Request was not successful. Response code: " + response.code());
                }
            }
        });
    }

    private void showAdminView() {
        runOnUiThread(new Runnable() {
            @Override
            public void run() {
                // admin buttons
                Button addRoomButton = findViewById(R.id.add_room_button);
                addRoomButton.setVisibility(View.VISIBLE);
                addRoomButton.setOnClickListener(new View.OnClickListener() {
                    @Override
                    public void onClick(View v) {
                        if (selectedBuilding == null || selectedBuilding.equals("")) {
                            Toast.makeText(BuildingManagementActivity.this, "Please select a building", Toast.LENGTH_SHORT).show();
                        } else {
                            Intent addNewRoomIntent = new Intent(BuildingManagementActivity.this, AddNewRoomActivity.class);
                            addNewRoomIntent.putExtra("building", selectedBuilding);
                            addNewRoomIntent.putExtra("AdminEmail", adminEmail);
                            startActivity(addNewRoomIntent);
                        }
                    }
                });

                Button modifyRoomButton = findViewById(R.id.modify_room_button);
                modifyRoomButton.setVisibility(View.VISIBLE);

                modifyRoomButton.setOnClickListener(new View.OnClickListener() {
                    @Override
                    public void onClick(View v) {
                        if (selectedBuilding == null || selectedBuilding.equals("")) {
                            Toast.makeText(BuildingManagementActivity.this, "Please select a building", Toast.LENGTH_SHORT).show();
                        } else {
                            Intent deleteRoomIntent = new Intent(BuildingManagementActivity.this, RoomManagementActivity.class);
                            deleteRoomIntent.putExtra("building", selectedBuilding);
                            startActivity(deleteRoomIntent);
                        }
                    }
                });
            }
        });
    }

    private void showSuperAdminView() {
        runOnUiThread(new Runnable() {
            @Override
            public void run() {
                // super admin buttons
                Button removeBuildingButton = findViewById(R.id.remove_building_button);
                removeBuildingButton.setVisibility(View.VISIBLE);
                removeBuildingButton.setOnClickListener(new View.OnClickListener() {
                    @Override
                    public void onClick(View v) {
                        Intent refreshPage = new Intent(BuildingManagementActivity.this, BuildingManagementActivity.class);
                        ServerRequests.requestDeleteBuildingFromAdmin(adminEmail, selectedBuilding, BuildingManagementActivity.this);
                        startActivity(refreshPage);
                    }
                });

                Button removeAdminButton = findViewById(R.id.remove_admin_button);
                removeAdminButton.setVisibility(View.VISIBLE);
                removeAdminButton.setOnClickListener(new View.OnClickListener() {
                    @Override
                    public void onClick(View v) {
                        Intent adminManagementIntent = new Intent(BuildingManagementActivity.this, AdminManagementActivity.class);
                        ServerRequests.requestDeleteAdmin(adminEmail, BuildingManagementActivity.this);
                        startActivity(adminManagementIntent);
                    }
                });
            }
        });
    }
}
